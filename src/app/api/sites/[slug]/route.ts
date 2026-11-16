import { getSite, publishSite, updateSiteGeneration } from "@/lib/sites";
import type { PublicationArticle, PublicationSite } from "@/lib/sites";

function mapPipelineArticle(article: Record<string, unknown>, fallbackIndustry: string): PublicationArticle {
  return {
    slug: String(article.slug || "story"),
    title: String(article.catchy_title || "Untitled story"),
    category: String(article.industry || fallbackIndustry),
    excerpt: String(article.the_hook || ""),
    hook: String(article.the_hook || ""),
    takeaways: Array.isArray(article.three_line_summary) ? article.three_line_summary.map(String) : [],
    whyItMatters: String(article.why_it_matters || ""),
    bodyMarkdown: String(article.body_markdown || ""),
    imageUrl: typeof article.hero_image_url === "string" ? article.hero_image_url : null,
    sourceUrl: typeof article.source_url === "string" ? article.source_url : null,
    sourceDomain: typeof article.source_domain === "string" ? article.source_domain : null,
    isSample: false,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let site = await getSite(slug);
  if (!site) return Response.json({ error: "Publication not found." }, { status: 404 });

  if (site.pipelineJobId) {
    const base = (process.env.PIPELINE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    try {
      const jobResponse = await fetch(`${base}/api/v1/jobs/${encodeURIComponent(site.pipelineJobId)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (jobResponse.ok) {
        const job = await jobResponse.json();
        const desiredTotal = site.targetArticleCount || Number(job.target_count || 0);
        const rawStatus = String(job.status || "discovering");
        let nextStatus: NonNullable<PublicationSite["generationStatus"]>;
        if (rawStatus === "failed") nextStatus = "failed";
        else if (rawStatus === "completed") nextStatus = site.articles.filter((article) => article.isSample !== true).length >= desiredTotal ? "completed" : "partial";
        else nextStatus = ["queued", "discovering", "scraping", "rewriting"].includes(rawStatus)
          ? rawStatus as NonNullable<PublicationSite["generationStatus"]>
          : "discovering";

        const update: Parameters<typeof updateSiteGeneration>[1] = { generationStatus: nextStatus };
        if (nextStatus === "failed") {
          update.generationError = typeof job.error_message === "string" && job.error_message
            ? job.error_message
            : "The pipeline could not finish this edition. Check the pipeline API logs and retry for the remaining stories.";
        } else if (nextStatus === "partial") {
          update.generationError = typeof job.error_message === "string" && job.error_message
            ? job.error_message
            : `This site has ${site.articles.filter((article) => article.isSample !== true).length} of ${desiredTotal} requested stories. Retry to generate the remaining articles.`;
        } else {
          update.generationError = undefined;
        }

        // Fetch saved stories on every poll so the preview grows as each article is persisted.
        const articleResponse = await fetch(`${base}/api/v1/sites/${encodeURIComponent(slug)}/articles`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (articleResponse.ok) {
          const payload = await articleResponse.json() as { articles?: Record<string, unknown>[] };
          const nextArticles = (Array.isArray(payload.articles) ? payload.articles : [])
            .map((article) => mapPipelineArticle(article, site!.industry));
          update.articles = nextArticles;
          if (rawStatus === "completed" && nextArticles.filter((article) => article.isSample !== true).length >= desiredTotal) {
            update.generationStatus = "completed";
            update.generationError = undefined;
          } else if (rawStatus === "completed") {
            update.generationStatus = "partial";
          }
        }

        site = await updateSiteGeneration(slug, update) || site;
      }
    } catch {
      // Keep the last saved site state. The client will poll again while the job is active.
    }
  }

  return Response.json(site, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await publishSite(slug);
  if (!site) return Response.json({ error: "Publication not found." }, { status: 404 });
  return Response.json({ slug: site.slug, status: site.status });
}
