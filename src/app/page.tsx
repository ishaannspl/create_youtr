"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SitePreview } from "./site-preview";
import { articleCountOptions, getIndustryDefinition, getPublicationPages, industries, type IndustryId } from "@/lib/industries";

// Each theme previews in its own real palette: [background, accent, ink].
const templates = [
  { name: "Editorial", description: "Broadsheet front page with a ticker", colors: ["#F1ECDF", "#B3261E", "#15110E"] },
  { name: "Studio", description: "Dark product journal, bento grid", colors: ["#070A0F", "#5EEAD4", "#EAF1F8"] },
  { name: "Minimal", description: "Giant type and a hover index", colors: ["#FFFFFF", "#FF4D00", "#0A0A0A"] },
  { name: "Nocturne", description: "Cinematic hero and film strip", colors: ["#0A0908", "#D9A95C", "#F4EEE3"] },
  { name: "Coastline", description: "Drifting waves, soft pebble covers", colors: ["#EAF7F5", "#0A7C86", "#0A3B47"] },
  { name: "Atelier", description: "Loud collage with marquees", colors: ["#FFEFE2", "#E5136B", "#2B0B33"] },
] as const;

const steps = [
  { title: "Set your direction", text: "Pick an industry, a topic and an audience. Give the publication a name." },
  { title: "Choose a theme", text: "Six editorial themes, each with its own layout, type and colour." },
  { title: "Review the first edition", text: "Stories arrive from the pipeline with source links and images where available." },
  { title: "Publish when ready", text: "Check the whole site, then publish it with a single action." },
];

const delay = (index: number, step = 90) => ({ "--d": `${index * step}ms` }) as CSSProperties;

export default function Home() {
  const router = useRouter();
  const [industryId, setIndustryId] = useState<IndustryId>("technology_ai");
  const [targetArticleCount, setTargetArticleCount] = useState<(typeof articleCountOptions)[number]>(3);
  const [topic, setTopic] = useState("AI tools for independent creators");
  const [siteName, setSiteName] = useState("Fieldnotes");
  const [audience, setAudience] = useState("Independent creators and small teams");
  const [template, setTemplate] = useState<(typeof templates)[number]["name"]>("Editorial");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const industry = getIndustryDefinition(industryId);
  const pageList = getPublicationPages(industryId).map((page) => page.label);
  const activeTemplate = templates.find((item) => item.name === template) ?? templates[0];
  const [bg, accent, ink] = activeTemplate.colors;

  // Fade sections in as they arrive. Content stays visible until the observer is ready, so nothing depends on JS to be readable.
  useEffect(() => {
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
      }),
      { threshold: 0.1, rootMargin: "0px 0px -4% 0px" },
    );
    root.classList.add("reveal-ready");
    items.forEach((item) => observer.observe(item));
    return () => { observer.disconnect(); root.classList.remove("reveal-ready"); };
  }, []);

  const createPublication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setFormError("");
    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: siteName, topic, audience, template, industry: industryId, targetArticleCount }),
      });
      const result = (await response.json()) as { slug?: string; error?: string };
      if (!response.ok || !result.slug) throw new Error(result.error || "Could not create your publication.");
      router.push(`/preview/${result.slug}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create your publication.");
      setCreating(false);
    }
  };

  return (
    <main className="home">
      <header className="site-nav">
        <a className="wordmark" href="#top" aria-label="Forme home"><span className="wordmark-icon">f</span><span>forme</span></a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#themes">Themes</a><a href="#builder">Builder</a><a href="#live-preview">Live preview</a><a href="#process">How it works</a><a href="#included">What&rsquo;s included</a>
        </nav>
        <a className="button button-primary button-sm" href="#builder">Start building</a>
      </header>

      <section className="hero" id="top">
        <h1 className="rise" style={delay(0)}>
          Your publication,<br /><em>already taking shape.</em>
        </h1>
        <p className="lead rise" style={delay(1)}>Choose a subject and an audience. Forme builds a complete, themed website and fills it with articles from the pipeline, each with a source link and image.</p>
        <div className="hero-actions rise" style={delay(2)}>
          <a className="button button-primary" href="#builder">Create your site</a>
          <a className="button button-ghost" href="#process">See how it works</a>
        </div>

        <div className="hero-stage rise" style={delay(3.5)} role="img" aria-label={`Preview of ${siteName || "your publication"}, a ${industry.shortLabel.toLowerCase()} publication`}>
          <div className="arch" aria-hidden="true" />
          <div className="mock" style={{ "--m-bg": bg, "--m-accent": accent, "--m-ink": ink } as CSSProperties} aria-hidden="true">
            <div className="mock-bar"><i /><i /><i /><span>{(siteName || "your-publication").toLowerCase().replace(/\s+/g, "-")}.site</span></div>
            <div className="mock-body">
              <div className="mock-masthead">
                <strong>{siteName || "Your publication"}</strong>
                <span>{pageList.slice(0, 4).join("   ")}</span>
              </div>
              <div className="mock-feature">
                <div className="mock-image"><b /><b /></div>
                <div>
                  <small>{industry.shortLabel} · First edition</small>
                  <h3>{topic ? `What is changing in ${topic}?` : "A fresh take on what matters."}</h3>
                  <p>Context, sources and plain-language explanations.</p>
                </div>
              </div>
              <div className="mock-rows"><span /><span /><span /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section themes-section" id="themes">
        <div className="section-head split reveal">
          <h2>Six themes, each with its own layout and voice.</h2>
          <p>Pick the one that suits your subject. You can change it in the builder at any time before you create the site.</p>
        </div>
        <ul className="theme-grid">
          {templates.map((item, index) => (
            <li key={item.name} className="reveal" style={delay(index % 3, 80)}>
              <a className={`theme-card ${template === item.name ? "is-active" : ""}`} href="#builder" onClick={() => setTemplate(item.name)}>
                <span className={`theme-art art-${item.name.toLowerCase()}`} style={{ background: item.colors[0], "--a": item.colors[1], "--k": item.colors[2] } as CSSProperties} aria-hidden="true">
                  <u /><i /><i /><i />
                </span>
                <span className="theme-meta">
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </span>
                <span className="theme-use">{template === item.name ? "Selected" : "Use this theme"}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="section builder-section" id="builder">
        <div className="section-head split reveal">
          <h2>Begin with what you want to say.</h2>
          <p>A few choices set the direction. You can review everything before it goes live.</p>
        </div>

        <form className="builder" onSubmit={createPublication}>
          <div className="builder-main">
            <fieldset className="card step-card reveal">
              <legend><span className="step-badge">1</span> Your publication</legend>
              <div className="field">
                <label htmlFor="industry">Industry</label>
                <select id="industry" value={industryId} onChange={(event) => {
                  const nextIndustry = getIndustryDefinition(event.target.value);
                  setIndustryId(nextIndustry.id);
                  setTopic(nextIndustry.defaultTopic);
                  setAudience(nextIndustry.defaultAudience);
                }}>
                  {industries.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="siteName">Publication name</label>
                <input id="siteName" value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="e.g. Fieldnotes" required maxLength={60} />
              </div>
              <div className="field">
                <label htmlFor="topic">What will it focus on?</label>
                <textarea id="topic" rows={2} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. AI tools for independent creators" required maxLength={140} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="audience">Who is it for?</label>
                  <input id="audience" value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="e.g. Freelancers and small teams" required maxLength={100} />
                </div>
                <div className="field">
                  <label htmlFor="articleCount">First edition size</label>
                  <select id="articleCount" value={targetArticleCount} onChange={(event) => setTargetArticleCount(Number(event.target.value) as (typeof articleCountOptions)[number])}>
                    {articleCountOptions.map((count) => <option key={count} value={count}>{count} articles{count === 3 ? " (recommended)" : ""}</option>)}
                  </select>
                </div>
              </div>
              <p className="hint">Stories are saved as they finish. If a source or the AI is unavailable, you keep what completed and can retry the rest.</p>
            </fieldset>

            <fieldset className="card step-card reveal">
              <legend><span className="step-badge">2</span> Visual theme</legend>
              <div className="template-options">
                {templates.map((option) => (
                  <button key={option.name} type="button" className={`template-choice ${template === option.name ? "selected" : ""}`} aria-pressed={template === option.name} onClick={() => setTemplate(option.name)}>
                    <span className="template-swatch" style={{ background: option.colors[0] }} aria-hidden="true">
                      <i style={{ background: option.colors[2] }} /><i style={{ background: option.colors[1] }} /><i style={{ background: option.colors[2], opacity: .35 }} />
                    </span>
                    <span className="template-text"><strong>{option.name}</strong><span>{option.description}</span></span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <aside className="builder-summary reveal">
            <div className="card summary-card">
              <span className="panel-label">Live preview</span>
              <div className="summary-preview" style={{ background: bg, color: ink, "--m-accent": accent } as CSSProperties}>
                <small>{industry.shortLabel}</small>
                <strong>{siteName || "Your publication"}</strong>
                <span>{topic || "Add a topic to begin"}</span>
                <i />
              </div>
              <dl className="summary-list">
                <div><dt>Industry</dt><dd>{industry.label}</dd></div>
                <div><dt>Audience</dt><dd>{audience || "—"}</dd></div>
                <div><dt>Theme</dt><dd>{template}</dd></div>
                <div><dt>First edition</dt><dd>{targetArticleCount} articles</dd></div>
              </dl>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button type="submit" className="button button-primary button-block" disabled={creating}>{creating ? "Creating your publication…" : "Build my website"}</button>
              <p className="hint">Creates a private local site and starts the article pipeline. Review every story before publishing.</p>
            </div>
          </aside>
        </form>
      </section>

      <section className="section live-section" id="live-preview">
        <div className="section-head split reveal">
          <h2>See the whole website before you build it.</h2>
          <p>This is the real design, not a sketch. Switch themes and your site redraws with its own layout, type and motion.</p>
        </div>
        <div className="reveal">
          <SitePreview
            payload={{ template, name: siteName, topic, audience, industry: industryId }}
            themes={templates.map((item) => item.name)}
            onSelectTheme={setTemplate}
          />
        </div>
      </section>

      <section className="section process-section" id="process">
        <div className="section-head split reveal">
          <h2>From idea to a finished site in four steps.</h2>
          <p>No templates to wrestle with and no blank pages. Each step builds on the last.</p>
        </div>
        <ol className="process-grid">
          {steps.map((step, index) => (
            <li className="process-step reveal" style={delay(index, 80)} key={step.title}>
              <span className="step-num">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section included-section" id="included">
        <div className="section-head split reveal">
          <h2>Ten pages, written in one voice.</h2>
          <p>A complete first version, designed as a real publication rather than a loose set of templates.</p>
        </div>
        <ul className="page-grid reveal">
          {pageList.map((page, index) => <li key={page}>{index === 2 ? `${industry.shortLabel} hub` : page}</li>)}
        </ul>
      </section>

      <section className="closing-cta">
        <div className="cta-inner reveal">
          <h2>Make a home for what you know.</h2>
          <p>Set your direction and see the first edition take shape.</p>
          <a href="#builder" className="button button-light">Start your publication</a>
        </div>
      </section>

      <footer className="site-footer">
        <a className="wordmark" href="#top"><span className="wordmark-icon">f</span><span>forme</span></a>
        <div className="footer-links"><a href="#themes">Themes</a><a href="#builder">Builder</a><a href="#process">How it works</a><a href="#included">What&rsquo;s included</a></div>
        <span className="copyright">© 2026 Forme</span>
      </footer>
    </main>
  );
}
