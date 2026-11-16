"""Rewrite a news article in Gen-Z style according to PRD Phase 3 specifications using Gemini Flash."""

from __future__ import annotations

import json
import os
import re
import random
import time
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from .openai_fallback import OpenAIError, chat_json
from .schemas import GenZArticle, ScrapedData

from pathlib import Path

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)
load_dotenv()

# ── Prompt ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are AajKiJantaAI — the lead editorial voice of AajKiJanta (genznews.site).
Tagline: "Truth First. News Always."

Your mission is to synthesize news into an engaging, razor-sharp, authentic Gen Z editorial voice.

EDITORIAL STANDARDS & MANDATORY STRUCTURE:
1. The Hook: 1–2 punchy sentences answering "Why should you care right now?"
2. TL;DR (Quick Hits): Exactly 3 crisp bullet points summarizing the gist.
3. The Breakdown: Short, digestible paragraphs (2–3 sentences max each) explaining what happened without corporate jargon or fluff.
4. Why It Matters: Practical cultural, financial, lifestyle, or industry takeaway for youth.
5. Source Footnote: "Sources: {source_domain}. Synthesized and curated by AajKiJanta."

FORBIDDEN AI SLOP (STRICTLY BANNED):
Do NOT use ANY of these words or phrases:
- "In today's fast-paced world"
- "Delve" or "Delving"
- "Tapestry"
- "Testament to"
- "In conclusion"
- "Moreover"
- "Furthermore"
- "Beacon"
- "Landscape"
- "Realm"
- "Symphony"
- "It is important to remember"
- Any robotic corporate transitions.
- Em-dashes ("—", "–", or "--") anywhere in your output. NEVER use em-dashes. Use colons, commas, periods, or standard hyphens instead.

TONE:
- Direct, smart, culturally clued-in, slightly witty, but 100% factually accurate.
- NOT cringe slang overload — speak like an intelligent Gen Z creator / journalist on Substack or Twitter/X.
- Zero hallucination of facts: rewrite only verified points from the source.

SEO BUNDLE:
- 3 high-CTR headline options (Punchy, intriguing, honest)
- 1 selected primary headline
- Meta description (STRICTLY under 155 characters)
- Clean kebab-case URL slug (e.g. "clean-energy-biogas-2026-bet")
- 3 to 5 relevant lowercase tags

CRITICAL OUTPUT FORMAT:
You MUST respond with a single valid JSON object with NO markdown code fences (no ```json).
Start your response with { and end with }.

JSON schema:
{
  "selected_headline": "string",
  "headline_options": ["string", "string", "string"],
  "meta_description": "string under 155 chars",
  "slug": "kebab-case-slug",
  "tags": ["tag1", "tag2", "tag3"],
  "hook": "1-2 punchy sentences",
  "tldr": ["point 1", "point 2", "point 3"],
  "breakdown": "Paragraph 1 (2-3 sentences).\\n\\nParagraph 2 (2-3 sentences).",
  "why_it_matters": "Practical takeaway paragraph.",
  "source_attribution": "Sources: [Domain/Outlet]. Synthesized and curated by AajKiJanta."
}"""


def _build_user_prompt(article: ScrapedData) -> str:
    lines = []
    if article.niche:
        lines.append(f"TARGET NICHE: {article.niche}")
    if article.original_title:
        lines.append(f"ORIGINAL HEADLINE: {article.original_title}")
    if article.original_author:
        lines.append(f"AUTHOR: {article.original_author}")
    if article.published_at:
        lines.append(f"DATE: {article.published_at}")
    lines.append(f"SOURCE OUTLET / DOMAIN: {article.domain}")
    lines.append("")
    lines.append("SOURCE ARTICLE CONTENT:")
    lines.append(article.original_content[:8000])
    return "\n".join(lines)


def _parse_json(raw: str) -> dict[str, Any]:
    """Extract a JSON object from model output robustly."""
    raw = raw.strip()

    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    # Direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Regex search for JSON block
    match = re.search(r"(\{.*\})", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Find candidate block with selected_headline or genz_title
    for candidate in re.finditer(r"\{[^{}]*\}", raw, re.DOTALL):
        try:
            data = json.loads(candidate.group())
            if "selected_headline" in data or "genz_title" in data:
                return data
        except json.JSONDecodeError:
            continue

    raise RuntimeError(f"Could not parse valid JSON from model output: {raw[:400]}")


def remove_em_dashes(text: str) -> str:
    """Replace em-dashes, en-dashes, and double hyphens with clean punctuation."""
    if not text:
        return text
    text = re.sub(r"(?<=\w)[—–](?=[A-Z])", ": ", text)
    text = re.sub(r"(?<=\w)[—–](?=[a-z])", ", ", text)
    text = re.sub(r"\s*[—–]\s*", " - ", text)
    text = text.replace("—", " - ").replace("–", "-").replace(" -- ", " - ")
    text = re.sub(r"[ ]{2,}", " ", text)
    return text.strip()


# ── Core caller with retry ────────────────────────────────────────────────────

class GeminiUnavailable(RuntimeError):
    """Gemini stayed overloaded or rate limited through every retry."""


_BACKOFF_SECONDS = (2, 4)
# With OpenAI as a fallback there is no point waiting on long Gemini sleeps.
_FAST_BACKOFF_SECONDS = (2, 4)


def _is_overload(exc: Exception) -> bool:
    text = str(exc)
    return any(marker in text for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED"))


def _call_gemini(
    client: genai.Client, model_name: str, prompt: str, backoff: tuple[float, ...] = _BACKOFF_SECONDS
) -> str:
    """Call Gemini, backing off (with jitter) while it is overloaded or rate limited."""
    for attempt in range(len(backoff) + 1):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )
            text = response.text
            if not text or not text.strip():
                raise RuntimeError("Gemini returned an empty response")
            return text.strip()

        except (genai_errors.ServerError, genai_errors.ClientError) as exc:
            if not _is_overload(exc):
                raise
            if attempt == len(backoff):
                raise GeminiUnavailable(str(exc)) from exc
            wait = backoff[attempt] + random.uniform(0, 1)
            print(f"    [Gemini] Overloaded / busy, retrying in {wait:.1f}s... ({attempt + 1}/{len(backoff)})", flush=True)
            time.sleep(wait)

    raise GeminiUnavailable("Gemini request failed after maximum retries.")


# ── Public API ────────────────────────────────────────────────────────────────

def generate_genz_article(article: ScrapedData) -> GenZArticle:
    """
    Send the scraped article to Gemini and return a fully structured
    GenZArticle adhering strictly to PRD Phase 3 editorial guidelines.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in .env")

    primary_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
    client = genai.Client(api_key=api_key)
    full_prompt = f"{_SYSTEM_PROMPT}\n\n{_build_user_prompt(article)}"

    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    try:
        if openai_key:
            raw = _call_gemini(client, primary_model, full_prompt, _FAST_BACKOFF_SECONDS)
        else:
            try:
                raw = _call_gemini(client, primary_model, full_prompt)
            except Exception as exc:
                print(f"    [Gemini] Primary model ({primary_model}) failed: {str(exc)[:120]}. Trying fallback...")
                raw = _call_gemini(client, "gemini-3.5-flash-lite", full_prompt)
    except GeminiUnavailable as exc:
        if not openai_key:
            raise
        openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        print(f"    [Gemini] Unavailable ({str(exc)[:80]}). Using OpenAI {openai_model}...")
        try:
            raw, _, _ = chat_json(full_prompt, api_key=openai_key, model=openai_model)
        except OpenAIError as oe:
            # Both providers are down: let the run loop count it and stop early.
            raise GeminiUnavailable(f"Gemini and OpenAI both unavailable: {oe}") from oe

    data = _parse_json(raw)

    headline = remove_em_dashes(
        data.get("selected_headline")
        or data.get("genz_title")
        or (data.get("headline_options", [""])[0] if data.get("headline_options") else "")
        or "AajKiJanta Update"
    )
    raw_headlines = data.get("headline_options") or [headline]
    headlines = [remove_em_dashes(str(h)) for h in raw_headlines]
    meta_desc = remove_em_dashes(data.get("meta_description") or "")
    slug = data.get("slug") or re.sub(r"[^a-z0-9]+", "-", headline.lower()).strip("-")
    slug = re.sub(r"[—–]+", "-", slug).strip("-")
    raw_tags = data.get("tags") or data.get("genz_tags") or []
    tags = [remove_em_dashes(str(t)) for t in raw_tags]
    hook = remove_em_dashes(data.get("hook") or "")
    raw_tldr = data.get("tldr") or []
    tldr = [remove_em_dashes(str(item)) for item in raw_tldr] if isinstance(raw_tldr, list) else [remove_em_dashes(str(raw_tldr))]
    breakdown = remove_em_dashes(data.get("breakdown") or "")
    why_it_matters = remove_em_dashes(data.get("why_it_matters") or "")
    attribution = remove_em_dashes(data.get("source_attribution") or f"Sources: {article.domain}. Synthesized and curated by AajKiJanta.")

    # Format full readable piece
    tldr_formatted = "\n".join([f"- {item}" for item in tldr]) if isinstance(tldr, list) else str(tldr)
    full_content = f"""**The Hook**
{hook}

**TL;DR (Quick Hits)**
{tldr_formatted}

**The Breakdown**
{breakdown}

**Why It Matters**
{why_it_matters}

---
*{attribution}*"""

    return GenZArticle(
        genz_title=headline,
        headlines=headlines,
        meta_description=meta_desc,
        slug=slug,
        genz_tags=tags,
        hook=hook,
        tldr=tldr if isinstance(tldr, list) else [str(tldr)],
        breakdown=breakdown,
        why_it_matters=why_it_matters,
        source_attribution=attribution,
        genz_content=full_content,
        niche=article.niche,
    )


# ── 7-Pillars Indian Audience Synthesis Engine ───────────────────────────────

_PILLAR_FRAMEWORKS = {
    "technology_ai": {
        "framework": "USE_CASE_FIT",
        "guidance": "Explain what the software or AI tool does, who it helps, how it fits a real workflow, and what limitations or tradeoffs the source confirms. Do not invent prices, benchmarks, or product capabilities.",
        "specs_prompt": "Extract verified product name, use case, supported workflow, availability, confirmed pricing, and limitations. Leave unsupported details out."
    },
    "national_politics": {
        "framework": "INVERTED_PYRAMID",
        "guidance": "Focus on high factual accuracy, how this policy/event impacts Indian youth, taxes, student visas, or economy. Zero sensationalism. Speak with clarity and authority.",
        "specs_prompt": "Extract relevant political/civic specs: location, policy_name, youth_impact, official_status"
    },
    "tech_hardware": {
        "framework": "FAB (Features-Advantages-Benefits)",
        "guidance": "Break down tech specs, benchmark performance, and street pricing in India (in ₹ INR). Call out whether it is worth buying or overhyped PR.",
        "specs_prompt": "Extract technical specs: price_inr (e.g. ₹65,000), key_specs (chipset/gpu/ram), pros, cons, value_verdict"
    },
    "travel_stays": {
        "framework": "BAB (Before-After-Bridge)",
        "guidance": "Paint an aesthetic, immersive sensory picture of the stay or destination in India. Give honest insider tips and check if it is truly worth the price.",
        "specs_prompt": "Extract travel specs: location, price_per_night_inr (e.g. ₹12,000), vibe_tags, signature_amenities, nearest_airport_km"
    },
    "money_career": {
        "framework": "PROBLEM_AGITATE_SOLVE",
        "guidance": "Deliver actionable wealth, career, or startup takeaways for young Indian professionals. Format all figures in ₹ INR (Lakhs / Crores).",
        "specs_prompt": "Extract financial specs: funding_or_salary_inr, company_or_sector, career_action_item"
    },
    "health_wellness": {
        "framework": "EVIDENCE_BASED_ACTION",
        "guidance": "Focus on realistic Indian diet adaptations, science-backed fitness, and mental wellness. No snake oil or unverified wellness claims.",
        "specs_prompt": "Extract wellness specs: core_finding, indian_diet_swap, daily_action_tip"
    },
    "weddings_luxury": {
        "framework": "STORYBRAND",
        "guidance": "Capture the aesthetic details, couture trends, and venue budgets for Indian weddings. Format budgets in ₹ Lakhs or Crores.",
        "specs_prompt": "Extract wedding specs: budget_tier_inr, venue_or_destination, aesthetic_palette, top_trend"
    },
    "entertainment_pop_culture": {
        "framework": "AIDA (Attention-Interest-Desire-Action)",
        "guidance": "Fast-paced, culturally clued-in commentary on cinema, OTT releases (Hotstar/Netflix India/JioCinema), and Indian creator trends.",
        "specs_prompt": "Extract entertainment specs: platform_or_theatre, box_office_inr, cast_or_creator, binge_verdict"
    }
}


def generate_multi_industry_article(
    article_data: dict[str, Any],
    industry: str,
    pillar: str = "national_politics"
) -> dict[str, Any]:
    """Synthesize an article tailored to Indian Gen Z readers across any industry."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in .env")

    model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    client = genai.Client(api_key=api_key)

    fw_info = _PILLAR_FRAMEWORKS.get(pillar, _PILLAR_FRAMEWORKS["national_politics"])
    framework_name = fw_info["framework"]
    framework_guidance = fw_info["guidance"]
    specs_prompt = fw_info["specs_prompt"]

    prompt = f"""You are the lead editor at AajKiJanta (genznews.site) writing for urban Indian Gen Z and millennials.
TARGET INDUSTRY: {industry}
CONTENT PILLAR: {pillar}
PUBLICATION FOCUS: {article_data.get('publication_focus') or industry}
TARGET AUDIENCE: {article_data.get('audience') or 'Indian readers interested in this industry'}
COPYWRITING FRAMEWORK: {framework_name}
FRAMEWORK GUIDANCE: {framework_guidance}

INDIAN AUDIENCE RULES:
1. Always format monetary values in Indian Rupees (₹) using Indian conventions: e.g., ₹45,000, ₹15 Lakhs, ₹2.5 Crores.
2. Tone: Clear, articulate, current, and culturally fluent. Write for the stated audience without forced slang.
3. Do NOT use cringe forced slang like "no cap" or "skibidi". Write intelligent, high-retention journalistic prose.
4. ABSOLUTELY NO EM-DASHES ("—" or "–"). Use standard hyphens, colons, or commas.
5. NO AI SLOP: Strictly ban "delve", "tapestry", "in today's fast-paced world", "testament to", "moreover".

SOURCE DETAILS:
Title: {article_data.get('title') or ''}
Domain: {article_data.get('domain') or ''}
Author: {article_data.get('author') or 'Staff'}
Raw Content:
{article_data.get('content', '')[:8000]}

OUTPUT FORMAT:
Respond with a SINGLE raw JSON object (no markdown code blocks, no ```json):
{{
  "catchy_title": "High-CTR punchy headline under 75 chars",
  "the_hook": "1-2 sentence compelling hook that immediately answers why Indian readers should care right now",
  "three_line_summary": [
    "Quick factual takeaway 1",
    "Quick factual takeaway 2",
    "Quick factual takeaway 3"
  ],
  "body_markdown": "A complete, useful 600-800 word article applying the {framework_name} framework. Use 4-6 descriptive level-two Markdown headings (##), with 2-3 substantial but readable paragraphs under each heading. Keep paragraphs focused, explain context and implications, and do not pad or repeat. Separate paragraphs with double newlines.",
  "why_it_matters": "1 crisp paragraph explaining the real-world impact for the Indian reader.",
  "structured_specs": {{
     "summary_note": "{specs_prompt}"
  }},
  "slug": "clean-kebab-case-slug",
  "tags": ["tag1", "tag2", "tag3"],
  "seo_description": "Meta description under 155 characters"
}}"""

    try:
        try:
            raw_response = _call_gemini(client, model_name, prompt)
        except GeminiUnavailable as exc:
            fallback_model = "gemini-flash-lite-latest"
            print(f"    [Gemini] {model_name} busy, switching to {fallback_model}...", flush=True)
            raw_response = _call_gemini(client, fallback_model, prompt)
    except Exception as gemini_error:
        openai_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not openai_key:
            raise
        openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        print(
            f"    [Gemini] Article generation failed ({type(gemini_error).__name__}). "
            f"Trying configured OpenAI fallback ({openai_model})...",
            flush=True,
        )
        try:
            raw_response, _, _ = chat_json(prompt, api_key=openai_key, model=openai_model)
        except OpenAIError as openai_error:
            raise GeminiUnavailable(
                f"Gemini failed ({gemini_error}); OpenAI fallback failed ({openai_error})"
            ) from openai_error
    parsed = _parse_json(raw_response)

    # Sanitize em-dashes and formatting
    catchy_title = remove_em_dashes(parsed.get("catchy_title") or article_data.get("title") or f"{industry} Update")
    the_hook = remove_em_dashes(parsed.get("the_hook") or "")
    three_line_summary = [remove_em_dashes(s) for s in parsed.get("three_line_summary", [])]
    body_markdown = remove_em_dashes(parsed.get("body_markdown") or "")
    why_it_matters = remove_em_dashes(parsed.get("why_it_matters") or "")
    slug = re.sub(r"[^a-z0-9\-]+", "", (parsed.get("slug") or "article").lower())
    tags = [t.lower().strip() for t in parsed.get("tags", [industry])]
    structured_specs = parsed.get("structured_specs") or {}

    return {
        "catchy_title": catchy_title,
        "the_hook": the_hook,
        "three_line_summary": three_line_summary,
        "body_markdown": body_markdown,
        "why_it_matters": why_it_matters,
        "framework_used": framework_name,
        "structured_specs": structured_specs,
        "slug": slug,
        "tags": tags,
        "seo_description": remove_em_dashes(parsed.get("seo_description") or "")[:155],
        "source_url": article_data.get("url", ""),
        "source_domain": article_data.get("domain", ""),
    }

