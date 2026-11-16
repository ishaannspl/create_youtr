import type { Metadata } from "next";
import { Inter, DM_Serif_Display, Source_Serif_4, Playfair_Display, Space_Grotesk, JetBrains_Mono, Cormorant_Garamond, Fraunces, Syne } from "next/font/google";
import "./globals.css";

// Theme display faces: each published theme gets its own voice.
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", style: ["normal", "italic"], variable: "--font-playfair" });
const space = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-space" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-cormorant" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", style: ["normal", "italic"], variable: "--font-fraunces" });
const syne = Syne({ subsets: ["latin"], display: "swap", weight: ["500", "700", "800"], variable: "--font-syne" });

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], display: "swap", weight: "400", style: ["normal", "italic"], variable: "--font-dm-serif" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], display: "swap", style: ["normal", "italic"], variable: "--font-source-serif" });

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
    <html lang="en" className={`h-full ${inter.variable} ${dmSerif.variable} ${sourceSerif.variable} ${playfair.variable} ${space.variable} ${jetbrains.variable} ${cormorant.variable} ${fraunces.variable} ${syne.variable}`}>
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  );
}
