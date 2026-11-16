import PublicationPreview from "./preview-client";

export const instant = false;

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicationPreview slug={slug} />;
}
