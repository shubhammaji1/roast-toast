import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";
import "./readability.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_URL || "https://roast-and-toast-ebon.vercel.app",
  ),
  title: {
    default: "Roast & Toast — Pitch it. Roast it. Build it.",
    template: "%s · Roast & Toast",
  },
  description:
    "A table for half-baked ideas and wholeheartedly useful feedback. Pitch an idea, find your people, and build something better.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link
          rel="preload"
          href="/fonts/dm-sans-latin-400-normal.4ab51eb2cd73.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/barlow-condensed-latin-700-normal.3787a5a41917.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/instrument-serif-latin-400-italic.5a51946dfffa.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
