import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forme — Your publication, already taking shape",
  description:
    "Choose an industry and a topic. Shape a complete, thoughtfully designed publication with a clear editorial structure, sourced article drafts, and a visual identity of its own.",
  keywords: [
    "publication website builder",
    "content website",
    "editorial website",
    "website creation",
  ],
  openGraph: {
    title: "Forme — Your publication, already taking shape",
    description: "A considered way to create a complete publication around what you care about.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
