#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AajKiJanta Multi-Industry Dynamic Scraping & Synthesis Pipeline
Allows autonomous discovery and Gen-Z rewriting for any arbitrary industry,
targeting Indian readers and logging across the 3-table Supabase architecture.

Usage:
    python dynamic_pipeline.py --industry "hotels" --topics "Goa boutique stays" "luxury villas" --count 3
    python dynamic_pipeline.py --industry "pc_hardware" --topics "Budget RTX 50-series gaming build" --count 2
    python dynamic_pipeline.py --industry "national_politics" --topics "Budget 2026 youth tax changes" --count 2
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time
import functools
import threading
from pathlib import Path

# Ensure instant live output
print = functools.partial(print, flush=True)

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from dotenv import load_dotenv
load_dotenv()

from app.discovery import discover_industry_articles, resolve_pillar
from app.scraper import scrape_article, ScraperError, ArticleExtractionError
from app.ai_writer import generate_multi_industry_article, GeminiUnavailable
from app.database import (
    compute_url_hash,
    article_exists_for_site,
    create_pipeline_job,
    update_pipeline_job,
    record_scraped_source,
    save_generated_article,
)
from framework_stage.images import fetch_og_image

OUTPUT_DIR = ROOT_DIR / "output"
_GENERATION_SLOT = threading.Semaphore(1)


def _single_worker(function):
    @functools.wraps(function)
    def run(*args, **kwargs):
        with _GENERATION_SLOT:
            return function(*args, **kwargs)
    return run


@_single_worker
def run_dynamic_pipeline(
    industry: str,
    sub_topics: list[str] | None = None,
    target_count: int = 3,
    site_slug: str | None = None,
    region: str = "in",
    job_id: str | None = None,
    audience: str = "",
) -> dict:
    topics = sub_topics or []
    slug = site_slug or f"{industry.lower().replace(' ', '-')}-hub"
    pillar = resolve_pillar(industry)

    print("=" * 65)
    print("AAJKIJANTA MULTI-INDUSTRY PIPELINE")
    print("=" * 65)
    print(f"  Target Industry : {industry}")
    print(f"  Content Pillar  : {pillar}")
    print(f"  Sub-Topics      : {', '.join(topics) if topics else 'General'}")
    print(f"  Target Count    : {target_count} articles")
    print(f"  Site Identifier : {slug}")
    print(f"  Target Audience : {audience or 'Indian readers interested in this industry'}")
    print("-" * 65)

    # 1. Initialize Pipeline Job Tracker
    job_id = job_id or create_pipeline_job(
        site_slug=slug,
        industry=industry,
        pillar=pillar,
        sub_topics=topics,
        target_count=target_count
    )
    # A job created by the website carries a placeholder pillar; record the real one.
    update_pipeline_job(job_id, pillar=pillar)
    print(f"\n[Step 1] Initialized Job: {job_id}")

    # 2. Autonomous Web Discovery
    print(f"[Step 2] Discovering articles across Indian news publications...")
    update_pipeline_job(job_id, status="discovering")

    try:
        candidates = discover_industry_articles(
            industry=industry,
            sub_topics=topics,
            limit=target_count,
            region=region
        )
    except Exception as exc:
        error_message = f"Source discovery failed: {type(exc).__name__}: {exc}"
        print(f"[!] {error_message}")
        update_pipeline_job(job_id, status="failed", error_message=error_message)
        return {"job_id": job_id, "status": "failed", "published": 0, "error": error_message}
    print(f"         Found {len(candidates)} candidate stories from {len({c.domain for c in candidates})} publications.")
    update_pipeline_job(job_id, status="scraping", urls_found=len(candidates))

    if not candidates:
        print("[!] No candidate articles found. Check search terms or network connection.")
        update_pipeline_job(job_id, status="failed", error_message="No candidate URLs discovered")
        return {"job_id": job_id, "status": "failed", "published": 0}

    # 3. Scraping & AI Synthesis Loop
    published_articles = []
    skipped_count = 0
    scrape_failures = 0
    ai_failures = 0
    save_failures = 0
    failure_examples: list[str] = []

    print(f"\n[Step 3] Processing candidates (Scraping + Gemini Synthesis)...")
    for idx, candidate in enumerate(candidates, start=1):
        if len(published_articles) >= target_count:
            break

        url_hash = compute_url_hash(candidate.url)
        print(f"\n  ({idx}/{len(candidates)}) [{candidate.domain}] {candidate.title[:55]}...")

        # The same source may be relevant to another publication, but do not
        # duplicate it inside the current site when a retry searches again.
        try:
            if article_exists_for_site(candidate.url, slug):
                print("      [SKIP] This publication already has this source")
                skipped_count += 1
                continue
        except Exception as exc:
            print(f"      [ERROR] Could not check publication duplicates: {exc}")
            save_failures += 1
            if len(failure_examples) < 3:
                failure_examples.append(f"Duplicate check: {type(exc).__name__}: {exc}")
            continue

        # Deduplication check
        # Scrape raw content with Trafilatura
        try:
            source_image = fetch_og_image(candidate.url)
            raw_data = scrape_article(candidate.url)
            content_len = len(raw_data.get("content", ""))
            print(f"      [OK] Scraped {content_len} chars clean content")

            # Record in scraped_sources
            source_id = record_scraped_source(
                job_id=job_id,
                industry=industry,
                domain=candidate.domain,
                source_url=candidate.url,
                url_hash=url_hash,
                raw_title=raw_data.get("title") or candidate.title,
                raw_markdown=raw_data.get("content", ""),
                lead_image=source_image,
                scrape_status="success"
            )

        except (ArticleExtractionError, ScraperError) as err:
            print(f"      [SKIP] Scraping failed or paywalled: {err}")
            scrape_failures += 1
            if len(failure_examples) < 3:
                failure_examples.append(f"{candidate.domain}: {err}")
            try:
                record_scraped_source(
                job_id=job_id,
                industry=industry,
                domain=candidate.domain,
                source_url=candidate.url,
                url_hash=url_hash,
                raw_title=candidate.title,
                raw_markdown="",
                scrape_status="failed_paywall"
                )
            except Exception as record_error:
                print(f"      [NOTICE] Could not save failed-source details: {record_error}")
            continue
        except Exception as exc:
            print(f"      [ERROR] Unexpected scrape error: {exc}")
            scrape_failures += 1
            if len(failure_examples) < 3:
                failure_examples.append(f"{candidate.domain}: {type(exc).__name__}: {exc}")
            continue

        # Synthesize with Gemini 3.8 Flash
        print(f"      [AI] Synthesizing with Gemini Flash ({pillar} framework)...")
        update_pipeline_job(job_id, status="rewriting")

        writing_data = {
            **raw_data,
            "publication_focus": ", ".join(topics) or industry,
            "audience": audience,
        }
        try:
            genz_out = generate_multi_industry_article(
                article_data=writing_data,
                industry=industry,
                pillar=pillar
            )
        except GeminiUnavailable as exc:
            print(f"      [AI UNAVAILABLE] {exc}")
            ai_failures += 1
            if len(failure_examples) < 3:
                failure_examples.append(f"AI writing: {exc}")
            break
        except Exception as exc:
            print(f"      [AI ERROR] Synthesis error: {exc}")
            ai_failures += 1
            if len(failure_examples) < 3:
                failure_examples.append(f"AI writing: {type(exc).__name__}: {exc}")
            continue

        try:
            save_generated_article(
                job_id=job_id,
                source_id=source_id,
                site_slug=slug,
                industry=industry,
                pillar=pillar,
                slug=genz_out["slug"],
                catchy_title=genz_out["catchy_title"],
                the_hook=genz_out["the_hook"],
                three_line_summary=genz_out["three_line_summary"],
                body_markdown=genz_out["body_markdown"],
                why_it_matters=genz_out["why_it_matters"],
                framework_used=genz_out["framework_used"],
                structured_specs=genz_out["structured_specs"],
                hero_image_url=source_image,
                source_url=candidate.url,
                source_domain=candidate.domain,
                tags=genz_out["tags"]
            )

        except Exception as exc:
            print(f"      [SAVE ERROR] Could not persist the article: {exc}")
            save_failures += 1
            if len(failure_examples) < 3:
                failure_examples.append(f"Article save: {type(exc).__name__}: {exc}")
            continue

        published_articles.append(genz_out)
        update_pipeline_job(job_id, articles_published=len(published_articles))
        print(f"      [SUCCESS] Saved article -> '{genz_out['catchy_title']}'")
        # Local markdown is an optional snapshot; a filesystem error must not
        # mark an article that is already safely stored in Supabase as failed.
        try:
            niche_dir = OUTPUT_DIR / industry.lower().replace(" ", "_")
            niche_dir.mkdir(parents=True, exist_ok=True)
            md_path = niche_dir / f"{genz_out['slug']}.md"
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(f"# {genz_out['catchy_title']}\n\n")
                f.write(f"> {genz_out['the_hook']}\n\n")
                f.write("### Quick Hits\n")
                for pt in genz_out["three_line_summary"]:
                    f.write(f"- {pt}\n")
                f.write(f"\n{genz_out['body_markdown']}\n\n")
                f.write(f"**Why It Matters to You:**\n{genz_out['why_it_matters']}\n")
        except OSError as exc:
            print(f"      [NOTICE] Article saved to Supabase; local snapshot skipped: {exc}")
        # Polite pause to stay below the provider's request rate.
        try:
            delay_seconds = max(0.0, min(float(os.getenv("GEMINI_DELAY_SECONDS", "3")), 30.0))
        except ValueError:
            delay_seconds = 3.0
        time.sleep(delay_seconds)

    # 4. Finalize Job
    final_status = "completed" if published_articles else "failed"
    error_message = None
    if final_status == "failed":
        if ai_failures:
            error_message = f"Article writing failed for {ai_failures} source(s). Check the Gemini API key, quota, and model availability."
        elif scrape_failures:
            error_message = f"Could not extract readable text from {scrape_failures} source(s). Try again later or use another topic."
        elif save_failures:
            error_message = f"AI writing finished, but {save_failures} article(s) could not be saved. Check Supabase connectivity and the article table schema."
        elif skipped_count:
            error_message = f"All {skipped_count} discovered stories were already processed, so this run had nothing new to publish. Try a more specific or newer topic."
        else:
            error_message = "The pipeline found sources but could not publish an article. Check the pipeline API logs."
        if failure_examples:
            error_message += " Details: " + "; ".join(failure_examples)
    elif len(published_articles) < target_count:
        error_message = f"Generated {len(published_articles)} of {target_count} requested articles."
        if ai_failures:
            error_message += f" AI writing failed for {ai_failures} source(s); check Gemini quota and model availability."
        elif scrape_failures:
            error_message += f" {scrape_failures} source(s) could not be extracted."
        elif save_failures:
            error_message += f" {save_failures} article(s) could not be saved to Supabase."
        elif skipped_count:
            error_message += f" {skipped_count} discovered stories were already processed."
        if failure_examples:
            error_message += " Details: " + "; ".join(failure_examples)
    update_pipeline_job(
        job_id=job_id,
        status=final_status,
        articles_published=len(published_articles),
        error_message=error_message,
    )

    print("\n" + "=" * 65)
    print(f"RUN SUMMARY -- Status: {final_status.upper()}")
    print("=" * 65)
    print(f"  Job ID             : {job_id}")
    print(f"  Target Industry    : {industry} ({pillar})")
    print(f"  Articles Published : {len(published_articles)} of {target_count} target")
    print(f"  Candidate URLs     : {len(candidates)} discovered across {len({c.domain for c in candidates})} sites")
    for i, a in enumerate(published_articles, start=1):
        print(f"    {i}. {a['catchy_title']}")
        print(f"       Slug: {a['slug']} | Framework: {a['framework_used']}")
    print("=" * 65)

    return {
        "job_id": job_id,
        "status": final_status,
        "published": len(published_articles),
        "articles": published_articles
    }


def main():
    parser = argparse.ArgumentParser(description="AajKiJanta Multi-Industry Scraping & Synthesis Engine")
    parser.add_argument("--industry", type=str, required=True, help="Industry or niche (e.g. 'hotels', 'gaming pc', 'weddings', 'news')")
    parser.add_argument("--topics", nargs="*", default=[], help="Sub-topics or keywords (e.g. 'Goa villas' 'resorts')")
    parser.add_argument("--count", type=int, default=3, help="Number of articles to generate (default: 3)")
    parser.add_argument("--site-slug", type=str, default=None, help="Unique site identifier for future microsites")
    parser.add_argument("--region", type=str, default="in", help="Target country region (default: 'in')")
    parser.add_argument("--job-id", type=str, default=None, help="Existing pipeline_jobs id to report progress into (used by the on-demand GitHub workflow)")
    parser.add_argument("--audience", type=str, default="", help="Who the publication is written for")

    args = parser.parse_args()
    result = run_dynamic_pipeline(
        industry=args.industry,
        sub_topics=args.topics,
        target_count=args.count,
        site_slug=args.site_slug,
        region=args.region,
        job_id=args.job_id,
        audience=args.audience,
    )
    # A run that published nothing must fail the CI job so it shows up in GitHub.
    if isinstance(result, dict) and result.get("status") == "failed":
        sys.exit(1)


if __name__ == "__main__":
    main()
