"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { PublicationSite } from "@/lib/sites";
import { getIndustryDefinition, getPublicationPages, personalizePageText } from "@/lib/industries";
import { ThemeHome } from "./themes";

function SiteLoading({ message }: { message: string }) {
  return <main className="publication-state"><span className="wordmark-icon">f.</span><p>{message}</p><Link href="/">Back to Forme</Link></main>;
}

export default function GeneratedPublication({ slug, pathParts, isPreview }: { slug: string; pathParts: string[]; isPreview: boolean }) {
  const pathKey = pathParts.join("/");
  const [site, setSite] = useState<PublicationSite | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => fetch(`/api/sites/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not-found");
        const data = await response.json() as PublicationSite;
        if (stopped) return;
        setSite(data);
        if (data.generationStatus && !["completed", "failed"].includes(data.generationStatus)) timer = setTimeout(load, 3000);
      })
      .catch(() => setNotFound(true));
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [slug]);

  if (notFound) return <SiteLoading message="This publication could not be found." />;
  if (!site) return <SiteLoading message="Opening the publication…" />;
  if (site.status !== "published" && !isPreview) return <SiteLoading message="This publication is still private." />;

  const industry = getIndustryDefinition(site.industry);
  const pages = getPublicationPages(site.industry);
  const primaryNavigation = pages.slice(0, 5);
  const footerNavigation = pages.slice(5);
  const article = pathParts[0] === "article" ? site.articles.find((item) => item.slug === pathParts[1]) : undefined;
  const markdownSections = (markdown: string) => {
    const blocks = markdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    const sections: { heading: string; paragraphs: string[] }[] = [];
    let current = { heading: "The story", paragraphs: [] as string[] };
    for (const block of blocks) {
      if (/^##\s+/.test(block)) {
        if (current.paragraphs.length || current.heading !== "The story") sections.push(current);
        current = { heading: block.replace(/^##\s+/, "").replace(/\*\*/g, ""), paragraphs: [] };
      } else {
        current.paragraphs.push(block.replace(/^[-*]\s+/gm, "• ").replace(/\*\*/g, ""));
      }
    }
    if (current.paragraphs.length) sections.push(current);
    return sections;
  };
  const articleSections = article?.sections?.length
    ? article.sections
    : article?.bodyMarkdown
      ? markdownSections(article.bodyMarkdown)
    : article?.paragraphs?.length
      ? [{ heading: "The story", paragraphs: article.paragraphs }]
      : [];
  const articleWordCount = article
    ? [article.title, article.excerpt, article.hook ?? "", ...(article.takeaways ?? []), ...articleSections.flatMap((section) => [section.heading, ...section.paragraphs]), article.whyItMatters ?? ""].join(" ").split(/\s+/).filter(Boolean).length
    : 0;
  const articleReadMinutes = Math.max(2, Math.ceil(articleWordCount / 180));
  const page = pages.find((item) => item.path === pathKey);
  const aboutPage = pages.find((item) => item.kind === "about");
  const pageDescription = page ? personalizePageText(page.description, site.topic, site.audience) : "";
  const customDescription = page?.kind === "about"
    ? `${site.name} covers ${site.topic} for ${site.audience}. The publication brings together sourced reporting, useful guides, and perspectives for this audience.`
    : page?.kind === "standards"
      ? `Stories are prepared from source reporting about ${site.topic}. Each article should retain a source link, identify its original publisher, and be reviewed for accuracy before public release.`
      : page?.kind === "contact"
        ? "The publication owner has not added contact details yet. Add a monitored email address before making this site public."
        : page?.kind === "privacy"
          ? "This page uses a starter privacy template. The site owner must review it, add the applicable data practices and contact details, and obtain appropriate legal review before public launch."
          : page?.kind === "terms"
            ? "This page uses a starter terms template. The site owner must review and complete it for the publication and its jurisdiction before public launch."
            : pageDescription;
  const articleHref = (articleSlug: string) => `/sites/${site.slug}/article/${articleSlug}${isPreview ? "?preview=1" : ""}`;

  return (
    <main className={`publication template-${site.template.toLowerCase()}`}>
      {isPreview && <div className="publication-preview-banner">PRIVATE PREVIEW <span>Only you can see this draft site.</span><Link href={`/preview/${site.slug}`}>Return to review ↗</Link></div>}
      <header className="publication-header"><Link href={`/sites/${site.slug}${isPreview ? "?preview=1" : ""}`} className="publication-brand">{site.name}<span>✳</span><small>{site.topic}</small></Link><nav aria-label="Publication navigation">{primaryNavigation.map((item) => <Link key={item.path || "home"} href={`/sites/${site.slug}${item.path ? `/${item.path}` : ""}${isPreview ? "?preview=1" : ""}`}>{item.label}</Link>)}</nav><Link className="publication-about-link" href={`/sites/${site.slug}/${aboutPage?.path || "about"}${isPreview ? "?preview=1" : ""}`}>About ↗</Link></header>
      {pathKey === "" ? <ThemeHome site={site} hrefFor={articleHref} latestHref={`/sites/${site.slug}/latest${isPreview ? "?preview=1" : ""}`} /> : article ? <article className="publication-article">
        <div className="article-topline"><span className="article-category">{article.category} · FIRST EDITION</span><span>{articleReadMinutes} MIN READ</span></div>
        <h1>{article.title}</h1>
        <p className="article-deck">{article.excerpt}</p>
        {article.hook && <blockquote className="article-hook">“{article.hook}”</blockquote>}
        {article.isSample && <div className="article-sample-notice">Illustrative starter article. This is not live reporting.</div>}
        {article.imageUrl && <figure className="article-hero-image"><Image src={article.imageUrl} alt={`Source image from ${article.sourceDomain || "the original article"}`} width={1400} height={900} unoptimized onError={(event) => { event.currentTarget.style.display = "none"; }} /><figcaption>Image via {article.sourceDomain || "source publication"}</figcaption></figure>}
        {article.takeaways?.length ? <aside className="article-takeaways"><span>THE QUICK TAKE</span><ul>{article.takeaways.map((item) => <li key={item}>{item}</li>)}</ul></aside> : null}
        <div className="article-body">{articleSections.map((section) => <section className="article-section" key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>)}</div>
        {article.whyItMatters && <aside className="article-why"><span>WHY IT MATTERS</span><p>{article.whyItMatters}</p><strong>Make the tool fit the work. Keep the point of view yours.</strong></aside>}
        <div className="article-source">{article.sourceUrl ? <>Source: <a href={article.sourceUrl} target="_blank" rel="noreferrer">{article.sourceDomain || "Original reporting"} ↗</a></> : "Source credit will appear here."}</div>
      </article> : pathParts[0] === "article" && site.generationStatus !== "completed" && site.generationStatus !== "partial" && site.generationStatus !== "failed" ? <SiteLoading message={`This story is being prepared: ${site.generationStatus || "queued"}.`} /> : page ? <section className="publication-static-page"><span className="publication-eyebrow">{page.eyebrow}</span><h1>{page.title}</h1><p>{customDescription}</p>{["latest", "topic", "guides", "reviews"].includes(page.kind) && <><p className="article-deck">{site.articles.length} stories in this publication about {site.topic}.</p><div className="publication-cards">{site.articles.map((item) => <Link href={articleHref(item.slug)} key={item.slug} className="publication-card">{item.imageUrl ? <Image className="publication-card-image" width={720} height={480} unoptimized src={item.imageUrl} alt={`Image from ${item.sourceDomain || "source publication"}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="card-art">✳</span>}<span className="article-category">{item.category}{item.sourceDomain ? ` · ${item.sourceDomain}` : ""}</span><h3>{item.title}</h3><p>{item.excerpt}</p><span className="card-read">Read story ↗</span></Link>)}</div></>}</section> : <SiteLoading message="This page isn’t part of this publication." />}
      <footer className="publication-footer"><Link href={`/sites/${site.slug}${isPreview ? "?preview=1" : ""}`} className="publication-brand">{site.name}<span>✳</span></Link><div>{footerNavigation.map((item) => <Link key={item.path} href={`/sites/${site.slug}/${item.path}${isPreview ? "?preview=1" : ""}`}>{item.label}</Link>)}</div><span>Created with Forme · {industry.label}</span></footer>
    </main>
  );
}
