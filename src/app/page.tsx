"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { articleCountOptions, getIndustryDefinition, getPublicationPages, industries, type IndustryId } from "@/lib/industries";

const templates = [
  { name: "Editorial", description: "Magazine-style feature layout", colors: ["#f4f1ea", "#49665a", "#202522"] },
  { name: "Studio", description: "Crisp dark journal for tech", colors: ["#111b24", "#8ebbc0", "#edf1ef"] },
  { name: "Minimal", description: "Quiet, type-first reading", colors: ["#fbfaf7", "#8b6c50", "#262824"] },
  { name: "Nocturne", description: "Dramatic, image-led stories", colors: ["#111114", "#c89c55", "#f2efe9"] },
  { name: "Coastline", description: "Airy, sunlit editorial", colors: ["#f2f8f6", "#23686a", "#173536"] },
  { name: "Atelier", description: "Expressive culture magazine", colors: ["#fcf5f6", "#873a57", "#38252e"] },
] as const;

const steps = [
  { title: "Set your direction", text: "Pick an industry, a topic and an audience. Give the publication a name." },
  { title: "Choose a theme", text: "Six editorial themes, each with its own layout, type and colour." },
  { title: "Review the first edition", text: "Stories arrive from the pipeline with source links and images where available." },
  { title: "Publish when ready", text: "Check the whole site, then publish it with a single action." },
];

function Arrow() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
          <a href="#builder">Builder</a><a href="#process">How it works</a><a href="#included">What&rsquo;s included</a>
        </nav>
        <a className="button button-primary button-sm" href="#builder">Start building</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="pill"><i /> Sourced stories, generated for you</span>
          <h1>Your publication, <span className="accent-text">already taking shape.</span></h1>
          <p className="lead">Choose a subject and an audience. Forme builds a complete, themed website and fills it with articles from the pipeline, each with a source link and image.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#builder">Create your site <Arrow /></a>
            <a className="button button-ghost" href="#process">See how it works</a>
          </div>
          <dl className="hero-stats">
            <div><dt>7</dt><dd>industries</dd></div>
            <div><dt>6</dt><dd>editorial themes</dd></div>
            <div><dt>10</dt><dd>pages per site</dd></div>
          </dl>
        </div>

        <div className="hero-art" aria-label="Preview of a generated publication">
          <div className="mock" style={{ "--m-bg": bg, "--m-accent": accent, "--m-ink": ink } as React.CSSProperties}>
            <div className="mock-bar"><i /><i /><i /><span>{(siteName || "your-publication").toLowerCase().replace(/\s+/g, "-")}.site</span></div>
            <div className="mock-body">
              <div className="mock-head"><strong>{siteName || "Your publication"}</strong><span>{pageList.slice(0, 4).join("  ·  ")}</span></div>
              <div className="mock-feature">
                <div className="mock-image"><b /><b /></div>
                <div>
                  <small>{industry.shortLabel.toUpperCase()} · FIRST EDITION</small>
                  <h3>{topic ? `What is changing in ${topic}?` : "A fresh take on what matters."}</h3>
                  <p>Context, sources and plain-language explanations.</p>
                </div>
              </div>
              <div className="mock-rows"><span /><span /><span /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="builder-section" id="builder">
        <div className="section-head">
          <span className="eyebrow">Start here</span>
          <h2>Begin with what you want to say.</h2>
          <p>A few choices set the direction. You can review everything before it goes live.</p>
        </div>

        <form className="builder" onSubmit={createPublication}>
          <div className="builder-main">
            <fieldset className="card step-card">
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

            <fieldset className="card step-card">
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

          <aside className="builder-summary">
            <div className="card summary-card">
              <span className="eyebrow">Live summary</span>
              <div className="summary-preview" style={{ background: bg, color: ink, "--m-accent": accent } as React.CSSProperties}>
                <small>{industry.shortLabel.toUpperCase()}</small>
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
              <button type="submit" className="button button-primary button-block" disabled={creating}>{creating ? "Creating your publication…" : <>Build my website <Arrow /></>}</button>
              <p className="hint">Creates a private local site and starts the article pipeline. Review every story before publishing.</p>
            </div>
          </aside>
        </form>
      </section>

      <section className="process-section" id="process">
        <div className="section-head center">
          <span className="eyebrow">How it works</span>
          <h2>From idea to a finished site in four steps.</h2>
        </div>
        <ol className="process-grid">
          {steps.map((step, index) => (
            <li className="card process-card" key={step.title}>
              <span className="step-badge">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="included-section" id="included">
        <div className="section-head">
          <span className="eyebrow">What&rsquo;s included</span>
          <h2>Ten pages. One coherent voice.</h2>
          <p>A complete first version, designed as a real publication rather than a loose set of templates.</p>
        </div>
        <ul className="page-grid">
          {pageList.map((page, index) => <li key={page}><b>{String(index + 1).padStart(2, "0")}</b>{index === 2 ? `${industry.shortLabel} hub` : page}</li>)}
        </ul>
      </section>

      <section className="closing-cta">
        <div>
          <h2>Make a home for what you know.</h2>
          <p>Set your direction and see the first edition take shape.</p>
        </div>
        <a href="#builder" className="button button-light">Start your publication <Arrow /></a>
      </section>

      <footer className="site-footer">
        <a className="wordmark" href="#top"><span className="wordmark-icon">f</span><span>forme</span></a>
        <div className="footer-links"><a href="#builder">Builder</a><a href="#process">How it works</a><a href="#included">What&rsquo;s included</a></div>
        <span className="copyright">© 2026 Forme</span>
      </footer>
    </main>
  );
}
