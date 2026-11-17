import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Saved ideas",
  alternates: { canonical: "/saved" },
};
import { Feed } from "@/components/feed";
export default function Page() {
  return <Feed mode="saved" />;
}
