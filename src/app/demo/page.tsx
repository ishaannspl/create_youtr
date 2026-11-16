import type { Metadata } from "next";
import DemoSite from "./demo-client";

// Rendered only inside the builder's live-preview frame; never something to index.
export const metadata: Metadata = { title: "Forme live preview", robots: { index: false, follow: false } };

export default function DemoPage() {
  return <DemoSite />;
}
