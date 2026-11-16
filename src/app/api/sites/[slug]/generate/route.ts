import { getSite, updateSiteGeneration } from "@/lib/sites";
import { getIndustryDefinition } from "@/lib/industries";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSite(slug);
  if (!site) return Response.json({ error: "Publication not found." }, { status: 404 });
  if (site.generationStatus && ["queued", "discovering", "scraping", "rewriting"].includes(site.generationStatus)) {
    return Response.json({ error: "Article generation is already running for this publication." }, { status: 409 });
  }

  const existingArticles = site.articles.filter((article) => article.isSample !== true).length;
  const remainingCount = Math.max(0, site.targetArticleCount - existingArticles);
  if (remainingCount === 0) {
    return Response.json({ error: "This publication already has its requested number of articles." }, { status: 409 });
  }

  const base = (process.env.PIPELINE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const industry = getIndustryDefinition(site.industry);
  try {
    const response = await fetch(`${base}/api/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_slug: site.slug,
        industry: industry.pipelineIndustry,
        sub_topics: [site.topic],
        audience: site.audience,
        target_count: remainingCount,
        region: "in",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.job_id !== "string") {
      const detail = typeof result.detail === "string" ? result.detail : "The pipeline could not start this publication.";
      return Response.json({ error: detail }, { status: response.status || 502 });
    }
    await updateSiteGeneration(slug, {
      pipelineJobId: result.job_id,
      generationStatus: "queued",
      generationError: undefined,
    });
    return Response.json({ slug, jobId: result.job_id, generationStatus: "queued" }, { status: 202 });
  } catch {
    return Response.json({ error: "The pipeline could not be reached. Confirm it is running on port 8000 and retry." }, { status: 503 });
  }
}
