import { getSite, publishSite, updateSiteGeneration } from "@/lib/sites";
import type { PublicationArticle, PublicationSite } from "@/lib/sites";
import { QUEUED_TIMEOUT_MS, getJob, getSiteArticles, markJobFailed, pipelineMode } from "@/lib/pipeline";

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
    try {
      const job = await getJob(site.pipelineJobId);
      if (job) {
        const desiredTotal = site.targetArticleCount || Number(job.target_count || 0);
        let rawStatus = String(job.status || "discovering");
        let jobError = typeof job.error_message === "string" && job.error_message ? job.error_message : "";

        // In GitHub mode a job that never leaves "queued" means the workflow did not start.
        if (pipelineMode() === "github" && ["queued", "pending"].includes(rawStatus) && job.created_at) {
          const age = Date.now() - new Date(job.created_at).getTime();
          if (age > QUEUED_TIMEOUT_MS) {
            rawStatus = "failed";
            jobError = "The generation workflow did not start within 10 minutes. Check the Actions tab of the GitHub repository, then retry.";
            await markJobFailed(site.pipelineJobId, jobError);
          }
        }

        let nextStatus: NonNullable<PublicationSite["generationStatus"]>;
        if (rawStatus === "failed") nextStatus = "failed";
        else if (rawStatus === "completed") nextStatus = site.articles.filter((article) => article.isSample !== true).length >= desiredTotal ? "completed" : "partial";
        else nextStatus = ["queued", "discovering", "scraping", "rewriting"].includes(rawStatus)
          ? rawStatus as NonNullable<PublicationSite["generationStatus"]>
          : "discovering";

        const update: Parameters<typeof updateSiteGeneration>[1] = { generationStatus: nextStatus };
        if (nextStatus === "failed") {
          update.generationError = jobError || "The pipeline could not finish this edition. Check the pipeline logs and retry for the remaining stories.";
        } else if (nextStatus === "partial") {
          update.generationError = jobError || `This site has ${site.articles.filter((article) => article.isSample !== true).length} of ${desiredTotal} requested stories. Retry to generate the remaining articles.`;
        } else {
          update.generationError = undefined;
        }

        // Fetch saved stories on every poll so the preview grows as each article is persisted.
        try {
          const nextArticles = (await getSiteArticles(slug)).map((article) => mapPipelineArticle(article, site!.industry));
          update.articles = nextArticles;
          if (rawStatus === "completed" && nextArticles.filter((article) => article.isSample !== true).length >= desiredTotal) {
            update.generationStatus = "completed";
            update.generationError = undefined;
          } else if (rawStatus === "completed") {
            update.generationStatus = "partial";
          }
        } catch {
          // Keep the stories already saved; the next poll tries again.
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
