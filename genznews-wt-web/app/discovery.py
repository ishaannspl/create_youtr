"""Autonomous Discovery Engine for Indian Audience & Unlimited Web Publications.

Takes an arbitrary industry or niche and sub-topics, generates Indian-targeted
search aggregations, and discovers fresh article URLs across diverse publications.
"""

from __future__ import annotations

import logging
import re
import urllib.parse
from dataclasses import dataclass
from typing import List, Optional, Set
import feedparser
import requests

try:
    from googlenewsdecoder import gnewsdecoder
except ImportError:
    gnewsdecoder = None

logger = logging.getLogger(__name__)

# Map common user keywords to one of the 7 Indian Pillars
PILLAR_MAPPINGS: dict[str, str] = {
    # 1. National & Global Affairs
    "news": "national_politics",
    "politics": "national_politics",
    "national": "national_politics",
    "global_politics": "national_politics",
    "geopolitics": "national_politics",
    "affairs": "national_politics",
    "budget": "national_politics",
    "policy": "national_politics",

    # 2. Technology, software, and AI tools
    "technology": "technology_ai",
    "ai": "technology_ai",
    "software": "technology_ai",
    "saas": "technology_ai",
    "creator_tools": "technology_ai",

    # 2. Tech & Hardware
    "tech": "tech_hardware",
    "hardware": "tech_hardware",
    "pc": "tech_hardware",
    "pc_electronics": "tech_hardware",
    "gpu": "tech_hardware",
    "gaming_pc": "tech_hardware",
    "electronics": "tech_hardware",
    "smartphones": "tech_hardware",
    "gadgets": "tech_hardware",

    # 3. Travel & Stays
    "hotels": "travel_stays",
    "hotel": "travel_stays",
    "hospitality": "travel_stays",
    "resorts": "travel_stays",
    "villas": "travel_stays",
    "travel": "travel_stays",
    "stays": "travel_stays",
    "cafes": "travel_stays",

    # 4. Money & Career
    "money": "money_career",
    "career": "money_career",
    "finance": "money_career",
    "crypto": "money_career",
    "startups": "money_career",
    "stock_market": "money_career",
    "jobs": "money_career",
    "layoffs": "money_career",
    "freelance": "money_career",

    # 5. Health & Wellness
    "health": "health_wellness",
    "fitness": "health_wellness",
    "wellness": "health_wellness",
    "nutrition": "health_wellness",
    "diet": "health_wellness",
    "biohacking": "health_wellness",

    # 6. Weddings & Luxury
    "wedding": "weddings_luxury",
    "weddings": "weddings_luxury",
    "shaadi": "weddings_luxury",
    "bridal": "weddings_luxury",
    "lehenga": "weddings_luxury",
    "couture": "weddings_luxury",
    "luxury": "weddings_luxury",

    # 7. Cinema & Pop Culture
    "movie": "entertainment_pop_culture",
    "movies": "entertainment_pop_culture",
    "cinema": "entertainment_pop_culture",
    "bollywood": "entertainment_pop_culture",
    "ott": "entertainment_pop_culture",
    "entertainment": "entertainment_pop_culture",
    "gaming": "entertainment_pop_culture",
}


@dataclass
class DiscoveredSource:
    url: str
    domain: str
    title: str
    published: Optional[str] = None
    pillar: str = "national_politics"


def resolve_pillar(industry: str) -> str:
    """Normalize user input string to one of the 7 pillars."""
    clean = re.sub(r"[^a-zA-Z0-9_]+", " ", industry.lower()).strip()
    words = clean.split()
    for word in words:
        if word in PILLAR_MAPPINGS:
            return PILLAR_MAPPINGS[word]
    for key, pillar in PILLAR_MAPPINGS.items():
        if key in clean:
            return pillar
    return "national_politics"


def clean_url(url: str) -> str:
    """Strip tracking queries (utm_*, ref, etc.) from candidate URLs."""
    parsed = urllib.parse.urlparse(url)
    q = urllib.parse.parse_qsl(parsed.query)
    clean_q = [(k, v) for k, v in q if not k.startswith("utm_") and k not in ("ref", "fbclid", "gclid", "oc")]
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(clean_q)))


def decode_google_news_url(url: str) -> str:
    """Unroll Google News wrapped URL to the real publisher destination."""
    if "news.google.com" not in url:
        return clean_url(url)

    if gnewsdecoder:
        try:
            res = gnewsdecoder(url)
            if res.get("success") and res.get("decoded_url"):
                return clean_url(res["decoded_url"])
        except Exception as exc:
            logger.debug("gnewsdecoder failed for %s: %s", url, exc)

    return clean_url(url)


def discover_industry_articles(
    industry: str,
    sub_topics: Optional[List[str]] = None,
    limit: int = 10,
    region: str = "in"
) -> List[DiscoveredSource]:
    """Dynamically discover fresh articles for any industry targeting Indian readers."""
    pillar = resolve_pillar(industry)

    # Candidate pool floor: always fetch at least 6 candidates so paywalled
    # domains on the first 1-2 URLs never exhaust the pool.
    candidate_target = max(limit * 3, 6)

    # Geographic source targeting:
    # national_politics → both Indian AND International sources.
    # All other commercial/lifestyle pillars → strictly Indian sources only.
    is_global_news = (pillar == "national_politics")

    queries: List[str] = []
    if is_global_news:
        # Use targeted queries that return reputable Indian + global news outlets,
        # NOT US state-level newspapers which dominate generic English RSS feeds.
        core_queries = [
            "India foreign policy geopolitics",
            "India politics government policy",
            "world news geopolitics international",
        ]
        queries.extend(core_queries)
        if sub_topics:
            for st in sub_topics:
                clean_st = st.strip()
                if clean_st and clean_st.lower() not in ("national_politics", "politics", "news"):
                    queries.append(clean_st)
    else:
        # Strictly Indian sources
        queries.append(f"{industry} India")
        if sub_topics:
            for st in sub_topics:
                clean_st = st.strip()
                if clean_st and clean_st.lower() != industry.lower():
                    queries.append(f"{clean_st} India")

    discovered: List[DiscoveredSource] = []
    seen_urls: Set[str] = set()
    seen_domains: Set[str] = set()

    for q in queries:
        if len(discovered) >= candidate_target:
            break

        encoded = urllib.parse.quote_plus(q)
        if is_global_news:
            # Indian edition first (surfaces NDTV, The Hindu, Indian Express, Scroll, etc.)
            # Then a second pass with the global US feed for international context.
            rss_urls = [
                f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en",
                f"https://news.google.com/rss/search?q={encoded}&hl=en&gl=US&ceid=US:en",
            ]
        else:
            # Query strictly Indian regional edition only
            rss_urls = [
                f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en",
            ]

        for rss_url in rss_urls:
            if len(discovered) >= candidate_target:
                break

            try:
                response = requests.get(
                    rss_url,
                    headers={"User-Agent": "FormePublicationBuilder/1.0"},
                    timeout=(4, 12),
                )
                response.raise_for_status()
                feed = feedparser.parse(response.content)
            except requests.RequestException as exc:
                logger.warning("News search failed for query %r: %s", q, exc)
                continue
            for entry in feed.entries:
                if len(discovered) >= candidate_target:
                    break

                raw_link = getattr(entry, "link", "")
                if not raw_link:
                    continue

                real_url = decode_google_news_url(raw_link)
                if not real_url or real_url in seen_urls:
                    continue

                parsed = urllib.parse.urlparse(real_url)
                domain = parsed.netloc.lower().replace("www.", "")
                if not domain or "google.com" in domain:
                    continue

                # Skip duplicate domains so we get diverse publications
                if domain in seen_domains:
                    continue

                seen_urls.add(real_url)
                seen_domains.add(domain)
                discovered.append(
                    DiscoveredSource(
                        url=real_url,
                        domain=domain,
                        title=getattr(entry, "title", ""),
                        published=getattr(entry, "published", None),
                        pillar=pillar,
                    )
                )

    logger.info("Discovered %d candidate articles across %d domains for industry '%s'",
                len(discovered), len({d.domain for d in discovered}), industry)
    return discovered
