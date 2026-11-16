"""Database storage helpers — SQLite local persistence + Supabase integration."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

try:
    from dotenv import load_dotenv  # type: ignore
    from pathlib import Path
    _ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(_ENV_PATH)
    load_dotenv()
except ImportError:
    pass

try:
    from postgrest.types import CountMethod
except ImportError:
    CountMethod = None  # type: ignore

SQLITE_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "articles.db")


# ── Canonical URL SHA-256 Hashing ─────────────────────────────────────────────

def get_canonical_url(url: str) -> str:
    """Normalize a URL to prevent duplicate processing due to tracking tags."""
    parsed = urlparse(url.strip())
    # Lowercase scheme and netloc
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/")

    # Strip analytics and tracking query params
    filtered_queries = []
    if parsed.query:
        for k, v in parse_qsl(parsed.query, keep_blank_values=False):
            k_lower = k.lower()
            if k_lower.startswith("utm_") or k_lower in {
                "ref", "source", "fbclid", "gclid", "at_medium", "at_campaign", "mc_cid"
            }:
                continue
            filtered_queries.append((k, v))
        filtered_queries.sort()

    clean_query = urlencode(filtered_queries)
    return urlunparse((scheme, netloc, path, "", clean_query, ""))


def compute_url_hash(url: str) -> str:
    """Return SHA-256 hash of canonical URL."""
    canonical = get_canonical_url(url)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── SQLite Setup ──────────────────────────────────────────────────────────────

def init_sqlite_db() -> None:
    """Initialize local SQLite database schema for Phase 2 deduplication & storage."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url_hash TEXT NOT NULL UNIQUE,
                    source_url TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    niche TEXT,
                    original_title TEXT,
                    original_author TEXT,
                    published_at TEXT,
                    original_content TEXT,
                    genz_title TEXT,
                    headlines_json TEXT,
                    meta_description TEXT,
                    slug TEXT,
                    genz_tags_json TEXT,
                    hook TEXT,
                    tldr_json TEXT,
                    breakdown TEXT,
                    why_it_matters TEXT,
                    source_attribution TEXT,
                    genz_content TEXT,
                    status TEXT DEFAULT 'done',
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_articles_url_hash ON articles (url_hash)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_articles_niche ON articles (niche)")
    finally:
        conn.close()


# Call on import
init_sqlite_db()


# ── Supabase Client (Optional / Fallback) ──────────────────────────────────────

def _get_supabase_client():
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or "").strip()
    if not url or url.startswith("http") is False or "PASTE_YOUR" in url:
        return None
    if not key:
        return None
    try:
        from supabase import create_client  # type: ignore
        return create_client(url, key)
    except Exception as exc:
        print(f"    [Supabase] Could not create client: {exc}")
        return None


# ── Storage Operations ────────────────────────────────────────────────────────

def article_exists(source_url: str) -> bool:
    """
    Check if canonical URL hash exists in local SQLite or Supabase.
    """
    url_hash = compute_url_hash(source_url)

    # 1. Check local SQLite
    conn = sqlite3.connect(SQLITE_DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM articles WHERE url_hash = ? OR source_url = ? LIMIT 1", (url_hash, source_url))
        if cur.fetchone() is not None:
            return True
    finally:
        conn.close()

    # 2. Check Supabase
    client = _get_supabase_client()
    if client:
        try:
            count_arg = CountMethod.exact if CountMethod is not None else None
            resp = client.table("articles").select("id", count=count_arg).eq("source_url", source_url).execute()
            if (resp.count or 0) > 0:
                return True
        except Exception:
            pass

    return False


def insert_article(
    *,
    source_url: str,
    domain: str,
    original_title: Optional[str] = None,
    original_author: Optional[str] = None,
    published_at: Optional[str] = None,
    original_content: str = "",
    genz_title: str = "",
    genz_content: str = "",
    genz_tags: Optional[list[str]] = None,
    niche: Optional[str] = None,
    headlines: Optional[list[str]] = None,
    meta_description: str = "",
    slug: str = "",
    hook: str = "",
    tldr: Optional[list[str]] = None,
    breakdown: str = "",
    why_it_matters: str = "",
    source_attribution: str = "",
    status: str = "done",
) -> dict[str, Any]:
    """
    Save the synthesized article into local SQLite and Supabase.
    """
    url_hash = compute_url_hash(source_url)
    tags_list = genz_tags or []
    headlines_list = headlines or [genz_title]
    tldr_list = tldr or []
    created_at = datetime.now(timezone.utc).isoformat()

    # 1. Insert into SQLite
    conn = sqlite3.connect(SQLITE_DB_PATH)
    row_id = None
    try:
        with conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT OR REPLACE INTO articles (
                    url_hash, source_url, domain, niche, original_title, original_author,
                    published_at, original_content, genz_title, headlines_json,
                    meta_description, slug, genz_tags_json, hook, tldr_json,
                    breakdown, why_it_matters, source_attribution, genz_content,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                url_hash, source_url, domain, niche, original_title, original_author,
                published_at, original_content, genz_title, json.dumps(headlines_list),
                meta_description, slug, json.dumps(tags_list), hook, json.dumps(tldr_list),
                breakdown, why_it_matters, source_attribution, genz_content,
                status, created_at
            ))
            row_id = cur.lastrowid
    finally:
        conn.close()

    result_data: dict[str, Any] = {
        "id": row_id or 1,
        "url_hash": url_hash,
        "source_url": source_url,
        "domain": domain,
        "niche": niche,
        "original_title": original_title,
        "original_author": original_author,
        "published_at": published_at,
        "genz_title": genz_title,
        "genz_content": genz_content,
        "genz_tags": tags_list,
        "meta_description": meta_description,
        "slug": slug,
        "status": status,
        "created_at": created_at,
    }

    # 2. Sync to Supabase
    client = _get_supabase_client()
    if client:
        try:
            payload = {
                "source_url": source_url,
                "domain": domain,
                "original_title": original_title,
                "original_author": original_author,
                "published_at": published_at,
                "original_content": original_content,
                "genz_title": genz_title,
                "genz_content": genz_content,
                "genz_tags": tags_list,
                "status": status,
            }
            sb_resp = client.table("articles").insert(payload).execute()
            if sb_resp.data:
                first_row = sb_resp.data[0]
                if isinstance(first_row, dict):
                    result_data["supabase_id"] = first_row.get("id")
        except Exception as exc:
            print(f"    [Supabase Note] Local SQLite saved; Supabase sync skipped: {exc}")

    return result_data


def get_article_by_id(article_id: int) -> Optional[dict[str, Any]]:
    """Fetch article by local ID."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM articles WHERE id = ?", (article_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["genz_tags"] = json.loads(d["genz_tags_json"]) if d.get("genz_tags_json") else []
        d["headlines"] = json.loads(d["headlines_json"]) if d.get("headlines_json") else []
        d["tldr"] = json.loads(d["tldr_json"]) if d.get("tldr_json") else []
        return d
    finally:
        conn.close()


def get_recent_articles(limit: int = 20, niche: Optional[str] = None) -> list[dict[str, Any]]:
    """Fetch the most recently generated articles."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        if niche:
            cur.execute(
                "SELECT id, domain, niche, genz_title, genz_tags_json, status, created_at FROM articles WHERE niche = ? ORDER BY id DESC LIMIT ?",
                (niche, limit)
            )
        else:
            cur.execute(
                "SELECT id, domain, niche, genz_title, genz_tags_json, status, created_at FROM articles ORDER BY id DESC LIMIT ?",
                (limit,)
            )
        rows = cur.fetchall()
        result = []
        for r in rows:
            item = dict(r)
            item["genz_tags"] = json.loads(item["genz_tags_json"]) if item.get("genz_tags_json") else []
            result.append(item)
        return result
    finally:
        conn.close()


# ── Multi-Industry 3-Table Pipeline Integration ──────────────────────────────

import uuid


def create_pipeline_job(
    site_slug: str,
    industry: str,
    pillar: str,
    sub_topics: list[str],
    target_count: int = 5
) -> str:
    """Create a new job in pipeline_jobs to track run progress."""
    client = _get_supabase_client()
    if not client:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.")
    job_id = str(uuid.uuid4())
    try:
        client.table("pipeline_jobs").insert({
                "id": job_id,
                "site_slug": site_slug,
                "industry": industry,
                "pillar": pillar,
                "sub_topics": sub_topics,
                "target_count": target_count,
                "status": "queued",
                "urls_found": 0,
                "articles_published": 0,
        }).execute()
    except Exception as exc:
        detail = str(exc)
        missing_table = any(marker in detail.lower() for marker in ("pgrst205", "does not exist", "could not find the table", "42p01"))
        if missing_table:
            message = f"Could not create pipeline job because a required table is missing. Apply the Supabase pipeline migration: {detail}"
        elif "winerror 10013" in detail.lower() or "forbidden by its access permissions" in detail.lower():
            message = "Could not reach Supabase from the pipeline process. Check its network access and restart the API."
        else:
            message = f"Could not create pipeline job in Supabase: {detail}"
        raise RuntimeError(message) from exc
    return job_id


def get_pipeline_job(job_id: str) -> Optional[dict[str, Any]]:
    client = _get_supabase_client()
    if not client:
        raise RuntimeError("Supabase is not configured.")
    response = client.table("pipeline_jobs").select("*").eq("id", job_id).limit(1).execute()
    return response.data[0] if response.data else None


def article_exists_for_site(source_url: str, site_slug: str) -> bool:
    """Deduplicate repeated sources within one generated publication only."""
    client = _get_supabase_client()
    if not client:
        raise RuntimeError("Supabase is not configured.")
    response = (client.table("generated_articles").select("id")
                .eq("site_slug", site_slug).eq("source_url", source_url).limit(1).execute())
    return bool(response.data)


def get_generated_articles_for_site(site_slug: str, limit: int = 30) -> list[dict[str, Any]]:
    client = _get_supabase_client()
    if not client:
        raise RuntimeError("Supabase is not configured.")
    response = (client.table("generated_articles").select("*")
                .eq("site_slug", site_slug).eq("status", "PUBLISHED")
                .order("created_at", desc=True).limit(limit).execute())
    return response.data or []


def update_pipeline_job(
    job_id: str,
    status: Optional[str] = None,
    urls_found: Optional[int] = None,
    articles_published: Optional[int] = None,
    error_message: Optional[str] = None,
    pillar: Optional[str] = None
) -> None:
    """Update job progress status in pipeline_jobs."""
    client = _get_supabase_client()
    if not client or not job_id:
        return

    payload: dict[str, Any] = {}
    if status is not None:
        payload["status"] = status
        if status in ("completed", "failed"):
            payload["completed_at"] = datetime.now(timezone.utc).isoformat()
    if urls_found is not None:
        payload["urls_found"] = urls_found
    if articles_published is not None:
        payload["articles_published"] = articles_published
    if error_message is not None:
        payload["error_message"] = error_message
    if pillar is not None:
        payload["pillar"] = pillar

    if payload:
        try:
            client.table("pipeline_jobs").update(payload).eq("id", job_id).execute()
        except Exception as exc:
            print(f"    [Supabase Notice] Update pipeline_jobs failed: {exc}")


def record_scraped_source(
    job_id: str,
    industry: str,
    domain: str,
    source_url: str,
    url_hash: str,
    raw_title: str,
    raw_markdown: str,
    lead_image: Optional[str] = None,
    scrape_status: str = "success"
) -> Optional[str]:
    """Store raw scraped data in scraped_sources."""
    client = _get_supabase_client()
    if not client:
        return None

    source_id = str(uuid.uuid4())
    payload = {
        "id": source_id,
        "job_id": job_id,
        "industry": industry,
        "domain": domain,
        "source_url": source_url,
        "url_hash": url_hash,
        "raw_title": raw_title,
        "raw_markdown": raw_markdown[:30000] if raw_markdown else "",
        "lead_image": lead_image,
        "scrape_status": scrape_status,
    }

    try:
        resp = client.table("scraped_sources").insert(payload).execute()
        if resp.data:
            return resp.data[0].get("id") or source_id
    except Exception as exc:
        print(f"    [Supabase Notice] Insert scraped_sources skipped: {exc}")
    return source_id


def save_generated_article(
    job_id: str,
    source_id: Optional[str],
    site_slug: str,
    industry: str,
    pillar: str,
    slug: str,
    catchy_title: str,
    the_hook: str,
    three_line_summary: list[str],
    body_markdown: str,
    why_it_matters: str,
    framework_used: str,
    structured_specs: dict[str, Any],
    hero_image_url: Optional[str],
    source_url: str,
    source_domain: str,
    tags: list[str]
) -> Optional[str]:
    """Store final AI-rewritten article in generated_articles and sync to site_articles."""
    client = _get_supabase_client()
    article_id = str(uuid.uuid4())
    url_hash = compute_url_hash(source_url)

    if not client:
        raise RuntimeError("Supabase is not configured; the generated article cannot be saved.")

    # The pipeline must not count an article unless its canonical row was saved.
    try:
        client.table("generated_articles").insert({
            "id": article_id,
            "job_id": job_id,
            "source_id": source_id,
            "site_slug": site_slug,
            "industry": industry,
            "pillar": pillar,
            "slug": slug,
            "catchy_title": catchy_title,
            "the_hook": the_hook,
            "three_line_summary": three_line_summary,
            "body_markdown": body_markdown,
            "why_it_matters": why_it_matters,
            "framework_used": framework_used,
            "structured_specs": structured_specs,
            "hero_image_url": hero_image_url,
            "source_url": source_url,
            "source_domain": source_domain,
            "tags": tags,
            "status": "PUBLISHED"
        }).execute()
    except Exception as exc:
        raise RuntimeError(f"Could not save the generated article in Supabase: {exc}") from exc

    # 2. Best-effort bridge for the legacy news site; the publication builder
    # reads the canonical generated_articles row above.
    try:
        summary_text = "\n".join([f"• {s}" for s in three_line_summary])
        full_body = f"{the_hook}\n\n{body_markdown}\n\n**Why It Matters:**\n{why_it_matters}"
        client.table("site_articles").upsert({
            "url_hash": url_hash,
            "slug": slug,
            "title": catchy_title,
            "summary": summary_text,
            "body_md": full_body,
            "framework": framework_used,
            "category": industry,
            "tags": tags,
            "source_url": source_url,
            "source_domain": source_domain,
            "image_url": hero_image_url,
            "status": "PUBLISHED",
            "byline": "AajKiJanta Indian Desk",
            "ai_disclosure": True,
        }, on_conflict="url_hash").execute()
    except Exception as exc:
        print(f"    [Supabase Notice] site_articles bridge skipped: {exc}")

    return article_id

