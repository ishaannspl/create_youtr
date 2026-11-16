"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicationSite } from "@/lib/sites";
import { getIndustryDefinition, getPublicationPages } from "@/lib/industries";

export default function PublicationPreview({ slug }: { slug: string }) {
  const [site, setSite] = useState<PublicationSite | null>(null);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollToken, setPollToken] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => fetch(`/api/sites/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this publication.");
        if (stopped) return;
        setSite(data as PublicationSite);
        if (data.generationStatus && !["completed", "partial", "failed"].includes(data.generationStatus)) timer = setTimeout(load, 2500);
      })
      .catch((reason: unknown) => { if (!stopped) { setError(reason instanceof Error ? reason.message : "Could not load this publication."); timer = setTimeout(load, 5000); } });
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [slug, pollToken]);

  const publish = async () => {
    setPublishing(true);
    setError("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(slug)}`, { method: "PATCH" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not publish this site.");
      setSite((current) => current ? { ...current, status: "published" } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not publish this site.");
    } finally {
      setPublishing(false);
    }
  };

  const retryGeneration = async () => {
    setRetrying(true);
    setError("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(slug)}/generate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not restart article generation.");
      setSite((current) => current ? { ...current, generationStatus: "queued", generationError: undefined, pipelineJobId: result.jobId } : current);
      setPollToken((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restart article generation.");
    } finally {
      setRetrying(false);
    }
  };

  if (error && !site) return <main className="preview-shell"><p role="alert">{error}</p><Link href="/">Back to the builder</Link></main>;
  if (!site) return <main className="preview-shell"><p>Preparing your publication…</p></main>;

  const industry = getIndustryDefinition(site.industry);
  const pageLabels = getPublicationPages(site.industry).map((page) => page.label);
  const readyCount = site.articles.filter((article) => article.isSample !== true).length;
  const isGenerating = !!site.generationStatus && !["completed", "partial", "failed"].includes(site.generationStatus);
  const isReady = site.generationStatus === "completed" && readyCount >= site.targetArticleCount;
  const progress = Math.min(100, Math.round((readyCount / Math.max(1, site.targetArticleCount)) * 100));
  const generationStep = {
    queued: "Preparing your edition",
    discovering: "Finding relevant sources",
    scraping: "Gathering article details",
    rewriting: "Writing and formatting your stories",
  }[site.generationStatus as "queued" | "discovering" | "scraping" | "rewriting"] || "Building your edition";

  return (
    <main className="preview-shell">
      <header className="preview-toolbar"><Link className="wordmark" href="/"><span className="wordmark-icon">f.</span><span>forme</span></Link><span className="draft-status"><i /> {site.status === "published" ? "Published locally" : "Private preview"}</span><Link className="toolbar-link" href={`/sites/${site.slug}?preview=1`} target="_blank">Open full website ↗</Link></header>
      <section className="preview-summary"><div><div className="eyebrow">{isReady ? "YOUR PUBLICATION IS READY" : isGenerating ? "YOUR PUBLICATION IS TAKING SHAPE" : "YOUR PUBLICATION PREVIEW"}</div><h1>{site.name}</h1><p>{site.topic} · For {site.audience} · {industry.label}</p></div><div className="preview-actions">{site.status === "published" ? <Link className="button button-dark" href={`/sites/${site.slug}`} target="_blank">View published site ↗</Link> : <button className="button button-dark" type="button" onClick={publish} disabled={publishing}>{publishing ? "Publishing…" : "Publish this website"} <span>↗</span></button>}<span>{site.template} theme · {industry.label}</span></div></section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {isGenerating && <div className="generation-progress" role="status" aria-live="polite"><span className="generation-spinner" aria-hidden="true"/><div className="generation-progress-copy"><strong>{generationStep}</strong><span>{readyCount} of {site.targetArticleCount} articles ready. This page updates automatically as each story is saved.</span><div className="generation-progress-track" role="progressbar" aria-label="Articles generated" aria-valuemin={0} aria-valuemax={site.targetArticleCount} aria-valuenow={readyCount}><span style={{ width: `${progress}%` }}/></div></div><span className="generation-progress-count">{progress}%</span></div>}
      {isReady && <div className="generation-success" role="status"><div><span className="success-check" aria-hidden="true">✓</span><div><strong>Your website is created and ready to view.</strong><span>All {site.targetArticleCount} articles are in place. Preview the complete site or publish it when you’re ready.</span></div></div><div className="generation-success-actions"><Link className="button button-light" href={`/sites/${site.slug}?preview=1`} target="_blank">Preview your website ↗</Link>{site.status === "published" ? <Link className="button button-dark" href={`/sites/${site.slug}`} target="_blank">View published site ↗</Link> : <button className="button button-dark" type="button" onClick={publish} disabled={publishing}>{publishing ? "Publishing…" : "Publish website ↗"}</button>}</div></div>}
      {(site.generationStatus === "failed" || site.generationStatus === "partial") && <div className="preview-disclosure"><strong>{site.generationStatus === "partial" ? "Your edition is partial:" : "Article generation failed:"}</strong> {site.generationError || `${readyCount} of ${site.targetArticleCount} requested articles are ready.`}<div className="generation-retry"><button className="button button-dark" type="button" onClick={retryGeneration} disabled={retrying}>{retrying ? "Starting retry…" : "Retry remaining articles"} <span>↻</span></button></div></div>}
      <section className="preview-article-list"><div className="preview-list-heading"><div><span>FIRST EDITION</span><h2>{site.generationStatus === "completed" ? "Pipeline generated stories" : "Your stories"}</h2></div><span>{readyCount} of {site.targetArticleCount} ready</span></div>{site.articles.map((article, index) => <article key={article.slug} className="preview-article"><span className="preview-article-number">{String(index + 1).padStart(2, "0")}</span><div><span className="article-category">{article.category}{article.sourceDomain ? ` · ${article.sourceDomain}` : ""}</span><h3>{article.title}</h3><p>{article.excerpt}</p></div><Link href={`/sites/${site.slug}/article/${article.slug}?preview=1`} target="_blank" aria-label={`Preview ${article.title}`}>↗</Link></article>)}</section>
      <section className="preview-pages"><span>INCLUDED SITE PAGES</span><p>{pageLabels.join(" · ")}</p><Link href={`/sites/${site.slug}?preview=1`} target="_blank">Browse all ten pages in the preview ↗</Link></section>
      <p className="preview-local-note">Publishing makes this website viewable from this local app at <code>localhost:3000/sites/{site.slug}</code>. Public hosting and a custom domain are separate deployment steps.</p>
    </main>
  );
}
