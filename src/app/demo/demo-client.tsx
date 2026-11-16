"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicationSite } from "@/lib/sites";
import { getIndustryDefinition, getPublicationPages, type IndustryId } from "@/lib/industries";
import { ThemeHome } from "@/app/sites/[slug]/[[...path]]/themes";

export type DemoPayload = {
  template: PublicationSite["template"];
  name: string;
  topic: string;
  audience: string;
  industry: IndustryId;
};

const CATEGORIES = ["The essentials", "Field guide", "Perspective", "Analysis", "Explainer"];

function buildSite(payload: DemoPayload): PublicationSite {
  const topic = payload.topic.trim() || "your subject";
  const audience = payload.audience.trim() || "curious readers";
  const lines: [string, string][] = [
    [`What is actually changing in ${topic}`, `A clear look at the shifts that matter for ${audience.toLowerCase()}, with the context behind each one.`],
    [`A practical guide for ${audience.toLowerCase()}`, "Start with the decisions that matter, skip the noise, and keep your own judgment in the loop."],
    ["Five questions worth asking this month", "The questions that cut through the headlines and help you decide what deserves your time."],
    ["The numbers behind the headlines", "What the data says, where it comes from, and how much weight each figure can carry."],
    ["What to read, watch and try next", "A short, curated list to carry the conversation forward, chosen by the editors."],
  ];
  return {
    slug: "preview",
    name: payload.name.trim() || "Your publication",
    industry: payload.industry,
    topic,
    audience,
    targetArticleCount: 5,
    region: "India",
    template: payload.template,
    status: "draft",
    createdAt: new Date(0).toISOString(),
    articles: lines.map(([title, excerpt], i) => ({
      slug: `sample-${i}`,
      title,
      excerpt,
      category: CATEGORIES[i % CATEGORIES.length],
      sourceDomain: "example.com",
    })),
  };
}

/** Rendered inside the builder's preview frame. The parent page posts the current choices; this page redraws the real theme. */
export default function DemoSite() {
  const [payload, setPayload] = useState<DemoPayload | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; payload?: DemoPayload } | null;
      if (data?.type === "forme-demo" && data.payload) setPayload(data.payload);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "forme-demo-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const site = useMemo(() => (payload ? buildSite(payload) : null), [payload]);
  if (!site) return null;

  const pages = getPublicationPages(site.industry);
  const industry = getIndustryDefinition(site.industry);
  const noop = () => "#";

  return (
    <main
      key={site.template}
      className={`publication template-${site.template.toLowerCase()}`}
      onClick={(event) => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }}
    >
      <header className="publication-header">
        <a href="#" className="publication-brand">{site.name}<span>✳</span><small>{site.topic}</small></a>
        <nav aria-label="Publication navigation">{pages.slice(0, 5).map((item) => <a key={item.label} href="#">{item.label}</a>)}</nav>
        <a className="publication-about-link" href="#">About ↗</a>
      </header>
      <ThemeHome site={site} hrefFor={noop} latestHref="#" />
      <footer className="publication-footer">
        <a href="#" className="publication-brand">{site.name}<span>✳</span></a>
        <div>{pages.slice(5).map((item) => <a key={item.label} href="#">{item.label}</a>)}</div>
        <span>Created with Forme · {industry.label}</span>
      </footer>
    </main>
  );
}
