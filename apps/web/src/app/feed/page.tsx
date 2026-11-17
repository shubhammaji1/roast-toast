import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "The table",
  alternates: { canonical: "/feed" },
};
import { Feed } from "@/components/feed";
export default function Page() {
  return <Feed />;
}
