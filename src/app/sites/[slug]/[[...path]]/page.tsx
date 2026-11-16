import GeneratedPublication from "./publication-client";

export const instant = false;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ slug, path = [] }, query] = await Promise.all([params, searchParams]);
  return <GeneratedPublication slug={slug} pathParts={path} isPreview={query.preview === "1"} />;
}
