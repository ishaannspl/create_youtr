import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getIndustryDefinition, type ArticleTargetCount, type IndustryId } from "@/lib/industries";

export type PublicationArticle = {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  hook?: string;
  takeaways?: string[];
  sections?: { heading: string; paragraphs: string[] }[];
  whyItMatters?: string;
  paragraphs?: string[];
  isSample?: boolean;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  sourceDomain?: string | null;
  bodyMarkdown?: string;
};

export type PublicationSite = {
  slug: string;
  name: string;
  industry: IndustryId;
  topic: string;
  audience: string;
  targetArticleCount: ArticleTargetCount;
  region: string;
  template: "Editorial" | "Studio" | "Minimal" | "Nocturne" | "Coastline" | "Atelier";
  status: "draft" | "published";
  createdAt: string;
  articles: PublicationArticle[];
  generationStatus?: "queued" | "discovering" | "scraping" | "rewriting" | "completed" | "partial" | "failed";
  generationError?: string;
  pipelineJobId?: string;
};

const dataDirectory = path.join(process.cwd(), ".local-sites");
const dataPath = path.join(dataDirectory, "sites.json");

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "my-publication";
}

async function readSites(): Promise<PublicationSite[]> {
  try {
    const stored = JSON.parse(await readFile(dataPath, "utf8")) as Array<PublicationSite & { style?: string }>;
    const sites = stored.map(({ style, ...site }) => ({
      ...site,
      industry: getIndustryDefinition(site.industry).id,
      targetArticleCount: site.targetArticleCount ?? 10,
      template: site.template ?? (style === "Modern" ? "Studio" : style === "Minimal" ? "Minimal" : "Editorial"),
      articles: site.articles?.some((article) => article.isSample === true && (article.sections?.length ?? 0) < 4)
        ? makeSampleArticles(site.topic)
        : site.articles,
    }));
    if (stored.some((site) => site.style || String(site.industry) === "Technology" || !site.targetArticleCount || site.articles?.some((article) => article.isSample === true && (article.sections?.length ?? 0) < 4))) {
      await writeSites(sites);
    }
    return sites;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeSites(sites: PublicationSite[]) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(sites, null, 2), "utf8");
  await rename(temporaryPath, dataPath);
}

export async function getSite(slug: string) {
  return (await readSites()).find((site) => site.slug === slug) ?? null;
}

function makeSampleArticles(topic: string): PublicationArticle[] {
  const subject = topic.trim();
  return [
    {
      slug: "what-to-know-first",
      title: `The best AI workflow starts with one annoying task`,
      category: "The essentials",
      excerpt: `A practical first step for creators exploring ${subject}: start with the work that slows you down, then keep your own judgment in the loop.`,
      hook: "Don’t automate your whole creative process. Find the one repetitive task that keeps stealing your best hour.",
      takeaways: [
        "Choose one recurring task with a clear, checkable result.",
        "Give the tool a narrow role and useful context, not an open-ended brief.",
        "Review the output before it reaches a client, audience, or public page.",
      ],
      sections: [
        { heading: "Start with the friction, not the tool", paragraphs: [
          `When people explore ${subject}, it is tempting to begin with a list of features. A better starting point is a workday moment: the rough notes that need organizing, the first draft that takes too long, or the repeated format that has to be prepared every week.`,
          "Write down what makes that task slow and what a useful result would look like. If you can describe the input and recognize a good output, you have a sensible experiment. If the task depends on taste, trust, or delicate context, keep a person closely involved.",
        ] },
        { heading: "Give the tool a bounded role", paragraphs: [
          "A small assignment is easier to evaluate than “do the whole project.” Ask for one transformation: sort these notes into themes, suggest three headline directions, or turn this outline into a first draft. Supply the audience, tone, and any facts that must stay unchanged.",
          "Then compare the result with the same task done your usual way. Look at editing time, usefulness, and mistakes, not just how quickly text appeared. A fast first draft that takes an hour to repair has not made the workflow better.",
        ] },
        { heading: "Turn a useful test into a repeatable routine", paragraphs: [
          "If the experiment helps, write down the parts that made it work: the material you supplied, the instruction that clarified the task, and the checks you made before using the result. Save that as a starting point, not a magic prompt that never needs changing.",
          "The goal is a process you can explain to a collaborator and repeat next week. Keep a person responsible for the final decision, and make it easy to skip the tool when the task needs more context than it has.",
        ] },
        { heading: "Keep the human edit", paragraphs: [
          "Treat generated material as a proposal. Check names, numbers, quotations, links, and claims against trustworthy sources. Remove lines that sound confident but say nothing, and add the lived experience or original perspective only you can provide.",
          "For work that represents a client or a publication, decide who approves the result and where the source material came from. That simple review step makes the process easier to trust and easier to repeat.",
        ] },
      ],
      whyItMatters: "The useful promise of creator tools is more room for the work that needs your voice. A small, measured workflow can make that promise real without handing over the decisions that define your work.",
      isSample: true,
    },
    {
      slug: "a-practical-field-guide",
      title: "A creator’s field guide to choosing an AI tool",
      category: "Field guide",
      excerpt: `Use your real workflow to assess ${subject}. A useful tool should fit the job, protect your material, and leave room to revise.`,
      hook: "A polished demo is easy to love. The real test is whether the tool still helps on a Tuesday afternoon, with your actual work in front of you.",
      takeaways: [
        "Test a real task you already understand instead of a staged prompt.",
        "Include setup, checking, and cleanup in your time comparison.",
        "Read the data and ownership terms before adding private material.",
      ],
      sections: [
        { heading: "Pick a task you can judge", paragraphs: [
          `Use a small example from the work you do around ${subject}. Keep the goal specific: produce a rough outline, organize interview notes, or draft a reusable checklist. Avoid starting with a high-stakes client deliverable or confidential information.`,
          "Before testing, decide what success means. Does the result need to be accurate, on-brand, easy to edit, or simply a useful starting point? A clear standard helps you spot when a tool is impressive in a demo but awkward in your routine.",
        ] },
        { heading: "Count the whole workflow", paragraphs: [
          "Measure more than the time between typing a prompt and seeing an answer. Include setup, context you had to add, fact-checking, corrections, and exporting the result. Note where the tool saved effort and where it created a new step.",
          "Try the same task more than once. If small changes in your instructions produce wildly different results, you may need a more repeatable process or a different tool. Consistency can matter more than one surprisingly good output.",
        ] },
        { heading: "Try it inside your real process", paragraphs: [
          "A standalone test can hide the annoying parts: moving the result to your editor, collaborating with a client, or keeping a clear record of revisions. Run the experiment in the place where the work normally happens, using material you are comfortable sharing.",
          "Notice who needs to review the output and whether they can understand how it was made. If the result cannot be checked or handed off cleanly, the tool may create more friction than it removes.",
        ] },
        { heading: "Know what would make you stop", paragraphs: [
          "Set a boundary before you begin. You might stop if the output invents details, if review takes longer than the original task, or if the service cannot meet your privacy needs. Clear limits keep a small test from drifting into a risky habit.",
          "A good choice does not need to be permanent. Keep the work portable, review the fit occasionally, and be willing to change tools when your needs change.",
        ] },
        { heading: "Check control and privacy", paragraphs: [
          "Look for practical controls: can you edit the output, keep a copy of the original, remove a draft, or export your work? Read how the service handles prompts and uploaded files. If the terms are unclear, do not put sensitive client or personal material into the tool.",
          "Finally, decide how the tool fits your existing setup. The best option is often the one your team can review and use reliably, not the one with the longest feature list.",
        ] },
      ],
      whyItMatters: "Choosing with a real task in mind helps creators spend less time chasing novelty and more time building a workflow they can explain, control, and improve.",
      isSample: true,
    },
    {
      slug: "questions-worth-asking",
      title: "Your first AI workflow does not need a giant tool stack",
      category: "Perspective",
      excerpt: `For creators exploring ${subject}, a smaller workflow is easier to learn, review, and improve than a pile of disconnected tools.`,
      hook: "More apps can make a simple process feel like a control room. Start with one clear job and add complexity only when the work calls for it.",
      takeaways: [
        "Map the steps you already take before adding a tool.",
        "Keep the handoff between tools simple and visible.",
        "Add another tool only when it solves a problem you can name.",
      ],
      sections: [
        { heading: "Map the work you already do", paragraphs: [
          `A workflow around ${subject} does not begin with software. It begins with the sequence of work: collect the material, decide what matters, make a draft, review it, and deliver it. Write those steps down before changing them.`,
          "This makes friction visible. Maybe the same notes are copied into several places, or maybe the hardest part is deciding what deserves attention. Those are different problems and may need different solutions.",
        ] },
        { heading: "Connect the fewest moving parts", paragraphs: [
          "For a first experiment, choose one place where an assistant or automation could help. Keep the output easy to inspect and make sure you can get back to the original material. A simple handoff is easier to debug than a chain of tools that passes work along unseen.",
          "If a step fails, you should know where it happened and what to do next. Save a copy, retry with clearer instructions, or complete that step by hand. A workflow is only useful if it has a sensible fallback.",
        ] },
        { heading: "Build a fallback before scaling", paragraphs: [
          "Decide what happens when the tool is unavailable or the result is not good enough. Maybe the old manual process remains available, or a teammate reviews the output before it moves forward. A fallback turns a fragile demo into a process that can handle an ordinary bad day.",
          "Keep the original input and make changes visible. If an error appears later, you can trace what happened instead of guessing which step changed the result.",
        ] },
        { heading: "Review the workflow, not just the output", paragraphs: [
          "A polished answer can still come from a messy process. Check whether the steps are clear, whether people know what they are responsible for, and whether the finished work meets the standard you set at the beginning.",
          "Ask the people using the process where it feels awkward. Their feedback may point to a missing instruction, an unnecessary handoff, or a step that should stay human. Improve that specific part before adding more software.",
        ] },
        { heading: "Let evidence earn the next tool", paragraphs: [
          "Run the small workflow for a few real tasks. Keep track of what it improved and where it introduced extra checking. Ask the people using it whether the process feels clearer, not just whether it looks clever in a walkthrough.",
          "Only add another tool when a repeated limitation gives you a reason. This keeps the setup understandable and leaves room to change direction as your work evolves.",
        ] },
      ],
      whyItMatters: "A lean workflow gives a solo creator or small team the benefits of assistance without turning the process itself into another project to manage.",
      isSample: true,
    },
  ];
}

export async function createSite(input: {
  name: string;
  topic: string;
  audience: string;
  industry: IndustryId;
  targetArticleCount: ArticleTargetCount;
  region?: string;
  template: "Editorial" | "Studio" | "Minimal" | "Nocturne" | "Coastline" | "Atelier";
}) {
  const sites = await readSites();
  const baseSlug = slugify(input.name);
  const slug = sites.some((site) => site.slug === baseSlug)
    ? `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    : baseSlug;
  const site: PublicationSite = {
    ...input,
    region: input.region || "India",
    slug,
    industry: input.industry,
    status: "draft",
    createdAt: new Date().toISOString(),
    articles: [],
    generationStatus: "queued",
  };
  await writeSites([...sites, site]);
  return site;
}

export async function updateSiteGeneration(slug: string, update: Partial<Pick<PublicationSite, "generationStatus" | "generationError" | "pipelineJobId" | "articles">>) {
  const sites = await readSites();
  const index = sites.findIndex((site) => site.slug === slug);
  if (index < 0) return null;
  sites[index] = { ...sites[index], ...update };
  await writeSites(sites);
  return sites[index];
}

export async function publishSite(slug: string) {
  const sites = await readSites();
  const index = sites.findIndex((site) => site.slug === slug);
  if (index < 0) return null;
  sites[index] = { ...sites[index], status: "published" };
  await writeSites(sites);
  return sites[index];
}
