# Forme local publication builder

A local MVP for creating a technology publication from a short brief. The customer chooses one of three distinct templates—Editorial, Studio, or Minimal. Each publication is rendered by the same Next.js app at its own route, with template-specific layout, typography, and color treatment. Site articles come from the `genznews-wt-web` pipeline; each article displays its source link and uses the source page's Open Graph image when available.

## Run locally

```bash
npm run dev
```

The pipeline dependencies are installed in `genznews-ecosystem-main/genznews-wt-web/.venv`. In the pipeline folder, start its API in one terminal:

```bash
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The pipeline's `.env` needs `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `GEMINI_API_KEY`; apply `genznews-ecosystem-main/genznews-wt-web/web/supabase/migrations/0003_multi_industry_pipeline.sql` to the connected Supabase project. In a second terminal, run `npm run dev` from this website project. `PIPELINE_API_URL=http://127.0.0.1:8000` is the default. Open <http://localhost:3000>.

If the system `npm` launcher is unavailable but project dependencies are installed, start Next directly:

```bash
node node_modules/next/dist/bin/next dev
```

## Manual flow

1. Enter a publication name, topic, audience, region, and choose a website template.
2. Select **Build my website**. The app saves the publication, starts a pipeline job, and opens its private review page at `/preview/<slug>`.
3. The review page polls the pipeline. It shows generation status, then lists the actual generated articles. Open an article to see its structured body, source credit, and source-site image when available.
4. Select **Publish this website**. The app marks it published locally.
5. Open `/sites/<slug>` to view the public local version. Direct article routes use `/sites/<slug>/article/<article-slug>`.

Local publication records are stored in `.local-sites/sites.json` and are excluded from Git. The API is implemented in the Next.js route handlers under `src/app/api/sites`.

## Current MVP limits

- Generation requires reachable pipeline API, configured Gemini credentials, Supabase credentials, and the pipeline migration. If unavailable, the saved preview explains the generation failure; it does not substitute sample stories.
- Images are taken from source pages' Open Graph metadata for this check. Some sources do not provide an image, block hotlinking, or change image URLs; in those cases the layout uses its designed visual fallback. Images are not copied into local media storage.
- Publishing only changes visibility in this local app. It does not deploy to a public host, create subdomains, or connect a custom domain.
- The JSON file store is for local development only. Replace it with Supabase or another shared database before deployment.
