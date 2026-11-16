"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, RefObject } from "react";
import type { PublicationArticle, PublicationSite } from "@/lib/sites";
import { getIndustryDefinition } from "@/lib/industries";
import "./themes.css";

type HomeProps = {
  site: PublicationSite;
  hrefFor: (articleSlug: string) => string;
  latestHref: string;
};

const pad = (n: number) => String(n + 1).padStart(2, "0");
const stagger = (index: number, step = 90) => ({ "--d": `${index * step}ms` }) as CSSProperties;

/* ---------- Shared motion helpers ---------- */

/** Fades and lifts `.rv` blocks and slides `.rv-words` headlines in as they enter the viewport.
 *  Content stays fully visible until this runs, and is skipped for reduced-motion users. */
function useMotion(root: RefObject<HTMLElement | null>, dependency: number) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    el.setAttribute("data-motion", "on");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-in"); io.unobserve(entry.target); }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    el.querySelectorAll(".rv, .rv-words").forEach((node) => io.observe(node));
    // Safety net: reveal anything already on screen even if the observer is slow to report.
    const reveal = () => el.querySelectorAll(".rv:not(.is-in), .rv-words:not(.is-in)").forEach((node) => {
      if (node.getBoundingClientRect().top < window.innerHeight) node.classList.add("is-in");
    });
    const quick = window.setTimeout(reveal, 80);
    const late = window.setTimeout(reveal, 1400);
    return () => { io.disconnect(); window.clearTimeout(quick); window.clearTimeout(late); el.removeAttribute("data-motion"); };
  }, [root, dependency]);
}

/** Writes the page scroll distance into `--sy` for parallax layers. */
function useScrollVar(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => { frame = 0; el.style.setProperty("--sy", `${Math.min(window.scrollY, 1400)}`); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [root]);
}

function Words({ text }: { text: string }) {
  return <>{text.split(" ").map((word, i) => (
    <span key={i}><span className="w"><span style={{ "--i": i } as CSSProperties}>{word}</span></span>{" "}</span>
  ))}</>;
}

/** Source image when there is one, a themed generated cover when there isn't or the host blocks hotlinking. */
function Art({ article, index, className = "" }: { article?: PublicationArticle; index: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (article?.imageUrl && !failed) {
    return <Image className={`art ${className}`} src={article.imageUrl} alt={`Image from ${article.sourceDomain || "the source publication"}`} width={1100} height={760} unoptimized loading={index < 3 ? "eager" : "lazy"} onError={() => setFailed(true)} />;
  }
  return (
    <span className={`art art-fallback ${className}`} style={{ "--v": index % 5 } as CSSProperties} aria-hidden="true">
      <b>{pad(index)}</b>
    </span>
  );
}

function Status({ site }: { site: PublicationSite }) {
  const saved = site.articles.filter((item) => item.isSample !== true).length;
  if (!site.generationStatus || site.generationStatus === "completed") return null;
  return <p className="t-status" role="status">Your first edition is {site.generationStatus}: {saved} of {site.targetArticleCount} articles saved.</p>;
}

function Empty() {
  return <div className="t-empty"><span /><p>The first edition is being prepared. Stories appear here as they are saved.</p></div>;
}

const issueDate = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const source = (article: PublicationArticle) => article.sourceDomain || "Source reporting";

/* ======================================================================
   1. EDITORIAL: a broadsheet front page
   ====================================================================== */
function EditorialHome({ site, hrefFor }: HomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const industry = getIndustryDefinition(site.industry);
  const stories = site.articles;
  useMotion(ref, stories.length);
  const [lead, ...rest] = stories;
  const briefs = rest.slice(0, 4);
  const more = rest.slice(4);
  const ticker = stories.length ? stories.map((s) => s.title) : [site.topic, industry.label, site.audience];

  return (
    <div className="ed" ref={ref}>
      <div className="ed-ticker" aria-hidden="true">
        <div className="ed-ticker-track">{[...ticker, ...ticker, ...ticker].map((t, i) => <span key={i}>{t}</span>)}</div>
      </div>

      <header className="ed-masthead">
        <div className="ed-dateline"><span>Vol. 01 · First edition</span><span>{issueDate()}</span><span>{industry.label}</span></div>
        <h1 className="ed-name rv-words"><Words text={site.name} /></h1>
        <p className="ed-tagline rv">{site.topic}. Written for {site.audience.toLowerCase()}.</p>
      </header>

      <Status site={site} />
      {!lead ? <Empty /> : (
        <>
          <section className="ed-front">
            <article className="ed-lead rv">
              <Link href={hrefFor(lead.slug)}>
                <figure className="ed-figure"><Art article={lead} index={0} /></figure>
                <span className="ed-kicker">{lead.category} · {source(lead)}</span>
                <h2>{lead.title}</h2>
                <p className="ed-deck">{lead.excerpt}</p>
                <span className="ed-more">Continue reading</span>
              </Link>
            </article>
            <aside className="ed-briefs rv" style={stagger(1)}>
              <h3>In brief</h3>
              <ol>
                {briefs.map((item, i) => (
                  <li key={item.slug}><Link href={hrefFor(item.slug)}><span className="ed-n">{pad(i + 1)}</span><span className="ed-t">{item.title}</span><em>{source(item)}</em></Link></li>
                ))}
              </ol>
            </aside>
          </section>

          {more.length > 0 && (
            <section className="ed-more-stories">
              <div className="ed-rule"><span>More from this edition</span></div>
              <div className="ed-cols">
                {more.map((item, i) => (
                  <article key={item.slug} className="ed-card rv" style={stagger(i % 3)}>
                    <Link href={hrefFor(item.slug)}>
                      <figure className="ed-figure small"><Art article={item} index={i + 5} /></figure>
                      <span className="ed-kicker">{item.category}</span>
                      <h3>{item.title}</h3>
                      <p>{item.excerpt}</p>
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ======================================================================
   2. STUDIO: a dark product-style journal with a bento grid
   ====================================================================== */
function StudioHome({ site, hrefFor }: HomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const industry = getIndustryDefinition(site.industry);
  const stories = site.articles;
  useMotion(ref, stories.length);

  const track = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--cx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--cy", `${event.clientY - rect.top}px`);
  };

  return (
    <div className="st" ref={ref}>
      <div className="st-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="st-gridbg" aria-hidden="true" />

      <section className="st-hero">
        <span className="st-chip rv"><i /> {industry.shortLabel} · live edition</span>
        <h1 className="st-title rv-words"><Words text={site.topic} /></h1>
        <p className="st-sub rv" style={stagger(2)}>{industry.homeDescription}</p>
        <div className="st-prompt rv" style={stagger(3)}>
          <span className="st-arrow">›</span>
          <span className="st-type" style={{ "--n": Math.min(site.audience.length, 60) } as CSSProperties}>{site.audience.slice(0, 60)}</span>
          <i className="st-caret" />
        </div>
        <dl className="st-stats rv" style={stagger(4)}>
          <div><dt>{String(stories.filter((s) => s.isSample !== true).length).padStart(2, "0")}</dt><dd>stories</dd></div>
          <div><dt>{new Set(stories.map((s) => s.sourceDomain).filter(Boolean)).size || 0}</dt><dd>sources</dd></div>
          <div><dt>10</dt><dd>pages</dd></div>
        </dl>
      </section>

      <Status site={site} />
      {stories.length === 0 ? <Empty /> : (
        <section className="st-bento">
          {stories.map((item, i) => (
            <Link key={item.slug} href={hrefFor(item.slug)} className={`st-card rv ${i === 0 ? "is-lead" : ""}`} style={stagger(i % 4, 70)} onPointerMove={track}>
              <Art article={item} index={i} />
              <span className="st-card-body">
                <small>{pad(i)} / {item.category}</small>
                <strong>{item.title}</strong>
                <span>{item.excerpt}</span>
                <em>{source(item)} ↗</em>
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

/* ======================================================================
   3. MINIMAL: giant type and a hover-to-preview index
   ====================================================================== */
function MinimalHome({ site, hrefFor }: HomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const industry = getIndustryDefinition(site.industry);
  const stories = site.articles;
  const [active, setActive] = useState<number | null>(null);
  useMotion(ref, stories.length);

  const move = (event: PointerEvent<HTMLElement>) => {
    ref.current?.style.setProperty("--px", `${event.clientX}px`);
    ref.current?.style.setProperty("--py", `${event.clientY}px`);
  };

  return (
    <div className="mi" ref={ref}>
      <section className="mi-hero">
        <span className="mi-label rv">{industry.label} <i /> {new Date().getFullYear()}</span>
        <h1 className="mi-title rv-words"><Words text={site.topic} /></h1>
        <p className="mi-sub rv" style={stagger(3)}>For {site.audience.toLowerCase()}.</p>
        <span className="mi-scroll rv" style={stagger(4)} aria-hidden="true">Scroll</span>
      </section>

      <Status site={site} />
      {stories.length === 0 ? <Empty /> : (
        <section className="mi-index" onPointerMove={move} onPointerLeave={() => setActive(null)}>
          <div className="mi-head"><span>Index</span><span>{stories.length} stories</span></div>
          <ol>
            {stories.map((item, i) => (
              <li key={item.slug} className="rv" style={stagger(i % 5, 50)}>
                <Link href={hrefFor(item.slug)} onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
                  <span className="mi-n">{pad(i)}</span>
                  <span className="mi-t">{item.title}</span>
                  <span className="mi-c">{item.category}</span>
                  <span className="mi-a" aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className={`mi-peek ${active !== null ? "on" : ""}`} aria-hidden="true">
            {active !== null && <Art key={active} article={stories[active]} index={active} />}
          </div>
        </section>
      )}
    </div>
  );
}

/* ======================================================================
   4. NOCTURNE: a cinematic hero and a horizontal film strip
   ====================================================================== */
function NocturneHome({ site, hrefFor }: HomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const industry = getIndustryDefinition(site.industry);
  const stories = site.articles;
  useMotion(ref, stories.length);
  useScrollVar(ref);
  const lead = stories[0];

  return (
    <div className="no" ref={ref}>
      <section className="no-hero">
        <div className="no-bg" aria-hidden="true"><Art article={lead} index={0} /></div>
        <div className="no-vignette" aria-hidden="true" />
        <div className="no-grain" aria-hidden="true" />
        <div className="no-copy">
          <span className="no-kicker rv">Chapter I · {lead?.category || industry.label}</span>
          <h1 className="no-title rv-words"><Words text={lead?.title || site.topic} /></h1>
          <p className="no-lede rv" style={stagger(3)}>{lead?.excerpt || industry.homeDescription}</p>
          {lead && <Link className="no-cta rv" style={stagger(4)} href={hrefFor(lead.slug)}><span>Enter the story</span><i /></Link>}
        </div>
        <div className="no-counter" aria-hidden="true"><b>01</b><i /><span>{String(Math.max(stories.length, 1)).padStart(2, "0")}</span></div>
        <div className="no-scrollcue" aria-hidden="true"><i /></div>
      </section>

      <Status site={site} />
      {stories.length === 0 ? <Empty /> : (
        <section className="no-rail">
          <div className="no-rail-head rv"><h2>The programme</h2><span>Swipe or scroll sideways</span></div>
          <ul className="no-track">
            {stories.map((item, i) => (
              <li key={item.slug} className="rv" style={stagger(i % 4, 80)}>
                <Link href={hrefFor(item.slug)} className="no-poster">
                  <Art article={item} index={i} />
                  <span className="no-poster-copy"><small>{pad(i)} · {item.category}</small><strong>{item.title}</strong></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ======================================================================
   5. COASTLINE: drifting waves and soft pebble covers
   ====================================================================== */
const WAVE = "M0,90 q90,-70 180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 V220 H0 Z";

function CoastlineHome({ site, hrefFor, latestHref }: HomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const industry = getIndustryDefinition(site.industry);
  const stories = site.articles;
  useMotion(ref, stories.length);

  return (
    <div className="co" ref={ref}>
      <section className="co-hero">
        <div className="co-sun" aria-hidden="true" />
        <i className="co-bubble b1" aria-hidden="true" /><i className="co-bubble b2" aria-hidden="true" /><i className="co-bubble b3" aria-hidden="true" />
        <div className="co-copy">
          <span className="co-chip rv">{industry.label}</span>
          <h1 className="co-title rv-words"><Words text={site.topic} /></h1>
          <p className="co-lede rv" style={stagger(3)}>{industry.homeDescription} Made for {site.audience.toLowerCase()}.</p>
          <Link className="co-btn rv" style={stagger(4)} href={latestHref}>Dive into the stories</Link>
        </div>
        <div className="co-pebbles" aria-hidden={stories.length === 0}>
          {stories.slice(0, 3).map((item, i) => (
            <Link key={item.slug} href={hrefFor(item.slug)} className={`co-pebble p${i}`} aria-label={item.title}><Art article={item} index={i} /></Link>
          ))}
        </div>
        <div className="co-waves" aria-hidden="true">
          <svg viewBox="0 0 2880 220" preserveAspectRatio="none"><path className="wv1" d={WAVE} /></svg>
          <svg viewBox="0 0 2880 220" preserveAspectRatio="none"><path className="wv2" d={WAVE} /></svg>
          <svg viewBox="0 0 2880 220" preserveAspectRatio="none"><path className="wv3" d={WAVE} /></svg>
        </div>
      </section>

      <section className="co-shore">
        <Status site={site} />
        <h2 className="co-h2 rv-words"><Words text="Fresh from the shore" /></h2>
        {stories.length === 0 ? <Empty /> : (
          <div className="co-grid">
            {stories.map((item, i) => (
              <Link key={item.slug} href={hrefFor(item.slug)} className="co-card rv" style={stagger(i % 3, 100)}>
                <Art article={item} index={i} />
                <span className="co-card-body"><small>{item.category} · {source(item)}</small><strong>{item.title}</strong><span>{item.excerpt}</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ======================================================================
   6. ATELIER: a loud, collaged culture magazine
   ====================================================================== */
function AtelierHome({ site, hrefFor }: HomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const industry = getIndustryDefinition(site.industry);
  const stories = site.articles;
  useMotion(ref, stories.length);
  const band = `${site.name} ✺ ${industry.shortLabel} ✺ ${site.audience} ✺ `;

  return (
    <div className="at" ref={ref}>
      <section className="at-hero">
        <svg className="at-sticker" viewBox="0 0 160 160" aria-hidden="true">
          <defs><path id="at-circle" d="M80,80 m-58,0 a58,58 0 1,1 116,0 a58,58 0 1,1 -116,0" /></defs>
          <circle cx="80" cy="80" r="78" />
          <text><textPath href="#at-circle">FIRST EDITION · FRESH STORIES · FIRST EDITION · FRESH STORIES ·</textPath></text>
          <text className="at-star" x="80" y="96" textAnchor="middle">✺</text>
        </svg>
        <span className="at-label rv">{industry.label}</span>
        <h1 className="at-title rv-words"><Words text={site.topic} /></h1>
        <p className="at-sub rv" style={stagger(3)}>{industry.homeDescription} For {site.audience.toLowerCase()}.</p>
      </section>

      <div className="at-band" aria-hidden="true"><div className="at-band-track">{Array.from({ length: 8 }, (_, i) => <span key={i}>{band}</span>)}</div></div>

      <Status site={site} />
      {stories.length === 0 ? <Empty /> : (
        <section className="at-collage">
          {stories.map((item, i) => (
            <Link key={item.slug} href={hrefFor(item.slug)} className={`at-card c${i % 6} rv`} style={stagger(i % 3, 90)}>
              <Art article={item} index={i} />
              <span className="at-card-body"><small>{pad(i)} — {item.category}</small><strong>{item.title}</strong><span>{item.excerpt}</span></span>
            </Link>
          ))}
        </section>
      )}

      <div className="at-band reverse" aria-hidden="true"><div className="at-band-track">{Array.from({ length: 8 }, (_, i) => <span key={i}>{band}</span>)}</div></div>
    </div>
  );
}

/* ---------- Entry point ---------- */
export function ThemeHome(props: HomeProps) {
  switch (props.site.template) {
    case "Studio": return <StudioHome {...props} />;
    case "Minimal": return <MinimalHome {...props} />;
    case "Nocturne": return <NocturneHome {...props} />;
    case "Coastline": return <CoastlineHome {...props} />;
    case "Atelier": return <AtelierHome {...props} />;
    default: return <EditorialHome {...props} />;
  }
}
