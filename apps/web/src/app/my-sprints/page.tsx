import type { Metadata } from "next";
import { MySprints } from "@/components/my-sprints";

export const metadata: Metadata = {
  title: "My Sprints",
  alternates: { canonical: "/my-sprints" },
};
export default function Page() {
  return <MySprints />;
}
