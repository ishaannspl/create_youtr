import { createSite, updateSiteGeneration } from "@/lib/sites";
import { PipelineError, startGeneration } from "@/lib/pipeline";
import { articleCountOptions, getIndustryDefinition, industries, type IndustryId } from "@/lib/industries";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please submit a valid publication brief." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Please submit a valid publication brief." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const audience = typeof input.audience === "string" ? input.audience.trim() : "";
  const industryId = typeof input.industry === "string" ? input.industry : "";
  const targetArticleCount = Number(input.targetArticleCount);
  const template = input.template;

  if (!name || name.length > 60 || !topic || topic.length > 140 || !audience || audience.length > 100) {
    return Response.json({ error: "Add a publication name, topic, and audience to continue." }, { status: 400 });
  }
  if (!industries.some((industry) => industry.id === industryId)) {
    return Response.json({ error: "Choose an industry from the list." }, { status: 400 });
  }
  if (!articleCountOptions.includes(targetArticleCount as (typeof articleCountOptions)[number])) {
    return Response.json({ error: "Choose an article count from the available options." }, { status: 400 });
  }
  if (!["Editorial", "Studio", "Minimal", "Nocturne", "Coastline", "Atelier"].includes(String(template))) {
    return Response.json({ error: "Choose one of the available visual themes." }, { status: 400 });
  }

  try {
    const industry = getIndustryDefinition(industryId);
    const site = await createSite({
      name, topic, audience, industry: industry.id as IndustryId,
      targetArticleCount: targetArticleCount as (typeof articleCountOptions)[number],
      template: template as "Editorial" | "Studio" | "Minimal" | "Nocturne" | "Coastline" | "Atelier",
    });
    try {
      const jobId = await startGeneration({ slug: site.slug, industry: industry.pipelineIndustry, topic, audience, count: targetArticleCount, region: "in" });
      await updateSiteGeneration(site.slug, { pipelineJobId: jobId, generationStatus: "queued" });
      return Response.json({ slug: site.slug, status: site.status, generationStatus: "queued" }, { status: 201 });
    } catch (error) {
      // The site is saved either way; the review page offers a retry for the first edition.
      const detail = error instanceof PipelineError ? error.message : "The pipeline could not start this publication.";
      await updateSiteGeneration(site.slug, { generationStatus: "failed", generationError: detail });
      return Response.json({ slug: site.slug, status: site.status, generationStatus: "failed", error: detail }, { status: 201 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The publication could not be saved. Please try again." }, { status: 500 });
  }
}
