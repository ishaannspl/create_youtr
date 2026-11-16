"""Pydantic schemas for API request/response and internal data transfer."""

from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, Field, HttpUrl, field_validator


# ── Request ──────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """Body sent to POST /generate."""
    url: HttpUrl
    niche: Optional[str] = None

    @field_validator("url", mode="before")
    @classmethod
    def strip_url(cls, v: str) -> str:
        return str(v).strip()


# ── Internal ──────────────────────────────────────────────────────────────────

class ScrapedData(BaseModel):
    """Cleaned article from the scraper, before AI processing."""
    url: str
    domain: str
    original_title: Optional[str] = None
    original_author: Optional[str] = None
    published_at: Optional[str] = None
    original_content: str
    niche: Optional[str] = None
    url_hash: Optional[str] = None


class GenZArticle(BaseModel):
    """AI-generated Gen-Z rewrite matching the PRD Phase 3 specification."""
    # Headings and SEO
    genz_title: str
    headlines: List[str] = []
    meta_description: str = ""
    slug: str = ""
    genz_tags: List[str] = []

    # Structured article sections
    hook: str = ""
    tldr: List[str] = []
    breakdown: str = ""
    why_it_matters: str = ""
    source_attribution: str = ""

    # Assembled complete markdown / HTML content
    genz_content: str = ""
    niche: Optional[str] = None


# ── Response ──────────────────────────────────────────────────────────────────

class ArticleOut(BaseModel):
    """Response returned by API endpoints."""
    id: int
    url: str
    domain: str
    original_title: Optional[str] = None
    original_author: Optional[str] = None
    published_at: Optional[str] = None
    genz_title: str
    headlines: List[str] = []
    meta_description: Optional[str] = None
    slug: Optional[str] = None
    hook: Optional[str] = None
    tldr: List[str] = []
    breakdown: Optional[str] = None
    why_it_matters: Optional[str] = None
    source_attribution: Optional[str] = None
    genz_content: str
    genz_tags: List[str] = []
    niche: Optional[str] = None
    status: str = "done"
    created_at: str

    class Config:
        from_attributes = True


# ── Dynamic Multi-Industry & 7-Pillars Schema ────────────────────────────────

from enum import Enum
from typing import Dict, Any


class PillarType(str, Enum):
    NATIONAL_POLITICS = "national_politics"
    TECH_HARDWARE = "tech_hardware"
    TRAVEL_STAYS = "travel_stays"
    MONEY_CAREER = "money_career"
    HEALTH_WELLNESS = "health_wellness"
    WEDDINGS_LUXURY = "weddings_luxury"
    ENTERTAINMENT_POP_CULTURE = "entertainment_pop_culture"


class IndustryJobRequest(BaseModel):
    """Payload to trigger an on-demand industry scraping job."""
    site_slug: str
    industry: str
    sub_topics: List[str] = []
    audience: str = Field(default="", max_length=100)
    target_count: int = Field(default=3, ge=1, le=10)
    region: str = "in"  # default India


class StructuredArticleOut(BaseModel):
    """The rich synthesized article with Indian context, Gen Z tone, and structured JSON specs."""
    slug: str
    catchy_title: str
    the_hook: str
    three_line_summary: List[str] = []
    body_markdown: str
    why_it_matters: str
    framework_used: str = "INVERTED_PYRAMID"
    structured_specs: Dict[str, Any] = {}
    hero_image_url: Optional[str] = None
    seo_title: str = ""
    seo_description: str = ""
    tags: List[str] = []
    source_url: str
    source_domain: str

