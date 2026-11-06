import type { Metadata } from "next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import "./readability.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
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
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
