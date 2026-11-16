import { getSite, updateSiteGeneration } from "@/lib/sites";
import { getIndustryDefinition } from "@/lib/industries";
import { PipelineError, startGeneration } from "@/lib/pipeline";

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

  const industry = getIndustryDefinition(site.industry);
  try {
    const jobId = await startGeneration({
      slug: site.slug,
      industry: industry.pipelineIndustry,
      topic: site.topic,
      audience: site.audience,
      count: remainingCount,
      region: "in",
    });
    await updateSiteGeneration(slug, { pipelineJobId: jobId, generationStatus: "queued", generationError: undefined });
    return Response.json({ slug, jobId, generationStatus: "queued" }, { status: 202 });
  } catch (error) {
    if (error instanceof PipelineError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "The pipeline could not start this publication." }, { status: 502 });
  }
}
