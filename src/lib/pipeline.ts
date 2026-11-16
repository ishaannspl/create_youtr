/**
 * Talks to the article pipeline. Two modes, chosen with PIPELINE_MODE:
 *
 *  - "api" (default): the FastAPI service in genznews-wt-web runs the job (local development).
 *  - "github": the website creates the job row in Supabase, then dispatches the "Generate site
 *    articles" GitHub Actions workflow. The workflow writes progress and articles to Supabase and
 *    the website reads them from there. No always-on pipeline server is needed.
 *
 * Server-side only: it reads the Supabase service key and the GitHub token from the environment.
 */

export class PipelineError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export type PipelineJob = {
  id?: string;
  status?: string;
  target_count?: number;
  error_message?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export const pipelineMode = (): "api" | "github" => (process.env.PIPELINE_MODE === "github" ? "github" : "api");

/** A job that is still "queued" after this long means GitHub never started the workflow. */
export const QUEUED_TIMEOUT_MS = 10 * 60 * 1000;

const apiBase = () => (process.env.PIPELINE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

function supabase() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!url || !key) throw new PipelineError("Supabase is not configured for the website. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.", 503);
  return {
    base: `${url}/rest/v1`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const { base, headers } = supabase();
  return fetch(`${base}/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
}

export type StartInput = {
  slug: string;
  industry: string;
  topic: string;
  audience: string;
  count: number;
  region?: string;
};

/** Starts article generation and returns the pipeline job id to poll. */
export async function startGeneration(input: StartInput): Promise<string> {
  return pipelineMode() === "github" ? startViaGithub(input) : startViaApi(input);
}

async function startViaApi(input: StartInput): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_slug: input.slug,
        industry: input.industry,
        sub_topics: [input.topic],
        audience: input.audience,
        target_count: input.count,
        region: input.region || "in",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PipelineError("The pipeline could not be reached. Confirm it is running on port 8000 and retry.", 503);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.job_id !== "string") {
    throw new PipelineError(typeof result.detail === "string" ? result.detail : "The pipeline could not start this publication.", response.status || 502);
  }
  return result.job_id;
}

function githubConfig() {
  const token = (process.env.GITHUB_DISPATCH_TOKEN || "").trim();
  const repository = (process.env.GITHUB_REPOSITORY || "").trim();
  const workflow = (process.env.GITHUB_WORKFLOW_FILE || "generate-site.yml").trim();
  const ref = (process.env.GITHUB_WORKFLOW_REF || "main").trim();
  if (!token || !repository) throw new PipelineError("GitHub is not configured for the website. Set GITHUB_DISPATCH_TOKEN and GITHUB_REPOSITORY.", 503);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new PipelineError("GITHUB_REPOSITORY must look like owner/repository.", 503);
  if (!/^[\w.-]+\.ya?ml$/.test(workflow)) throw new PipelineError("GITHUB_WORKFLOW_FILE must be a workflow file name such as generate-site.yml.", 503);
  return { token, repository, workflow, ref };
}

async function startViaGithub(input: StartInput): Promise<string> {
  const github = githubConfig();
  const jobId = crypto.randomUUID();

  // 1. The job row exists before the workflow starts, so the review page has something to poll straight away.
  let insert: Response;
  try {
    insert = await rest("pipeline_jobs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: jobId,
        site_slug: input.slug,
        industry: input.industry,
        pillar: input.industry,
        sub_topics: [input.topic],
        target_count: input.count,
        status: "queued",
        urls_found: 0,
        articles_published: 0,
      }),
    });
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError("Supabase could not be reached. Check your connection and retry.", 503);
  }
  if (!insert.ok) {
    const detail = await insert.text().catch(() => "");
    const missing = /PGRST205|does not exist|could not find the table|42P01/i.test(detail);
    throw new PipelineError(
      missing
        ? "The pipeline tables are missing in Supabase. Apply migrations 0003 and 0004 from genznews-wt-web/web/supabase/migrations."
        : `Could not create the pipeline job in Supabase (${insert.status}).`,
      503,
    );
  }

  // 2. Ask GitHub to run the workflow for this job.
  let dispatch: Response;
  try {
    dispatch = await fetch(`https://api.github.com/repos/${github.repository}/actions/workflows/${github.workflow}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${github.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: github.ref,
        inputs: {
          job_id: jobId,
          site_slug: input.slug,
          industry: input.industry,
          topic: input.topic,
          audience: input.audience || "",
          count: String(input.count),
          region: input.region || "in",
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    await markJobFailed(jobId, "GitHub could not be reached to start the workflow.");
    throw new PipelineError("GitHub could not be reached to start the workflow. Retry in a moment.", 503);
  }

  if (dispatch.status !== 204) {
    const body = (await dispatch.json().catch(() => ({}))) as { message?: string };
    const message =
      dispatch.status === 401 || dispatch.status === 403
        ? "GitHub rejected the token. Check that GITHUB_DISPATCH_TOKEN has Actions: Read and write access to the repository."
        : dispatch.status === 404
          ? `GitHub could not find ${github.workflow} on ${github.repository}. Confirm the workflow is committed to the ${github.ref} branch.`
          : `GitHub could not start the workflow: ${body.message || dispatch.status}`;
    await markJobFailed(jobId, message);
    throw new PipelineError(message, dispatch.status === 404 || dispatch.status === 422 ? 502 : 503);
  }
  return jobId;
}

export async function getJob(jobId: string): Promise<PipelineJob | null> {
  if (pipelineMode() === "github") {
    const response = await rest(`pipeline_jobs?id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`);
    if (!response.ok) return null;
    const rows = (await response.json().catch(() => [])) as PipelineJob[];
    return rows[0] ?? null;
  }
  const response = await fetch(`${apiBase()}/api/v1/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  return response.ok ? ((await response.json()) as PipelineJob) : null;
}

export async function getSiteArticles(slug: string): Promise<Record<string, unknown>[]> {
  if (pipelineMode() === "github") {
    const response = await rest(`generated_articles?site_slug=eq.${encodeURIComponent(slug)}&status=eq.PUBLISHED&order=created_at.desc&limit=30&select=*`);
    if (!response.ok) throw new PipelineError(`Could not read articles from Supabase (${response.status}).`, 503);
    return (await response.json()) as Record<string, unknown>[];
  }
  const response = await fetch(`${apiBase()}/api/v1/sites/${encodeURIComponent(slug)}/articles`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new PipelineError(`Could not read articles from the pipeline (${response.status}).`, 503);
  const payload = (await response.json()) as { articles?: Record<string, unknown>[] };
  return Array.isArray(payload.articles) ? payload.articles : [];
}

/** Records a failure on the job row (GitHub mode only; the API pipeline records its own). */
export async function markJobFailed(jobId: string, message: string) {
  if (pipelineMode() !== "github") return;
  try {
    await rest(`pipeline_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", error_message: message, completed_at: new Date().toISOString() }),
    });
  } catch {
    // The caller already reports the failure; a second failure here changes nothing for the user.
  }
}
