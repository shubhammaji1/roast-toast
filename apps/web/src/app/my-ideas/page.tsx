import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "My ideas",
  alternates: { canonical: "/my-ideas" },
};
import { Feed } from "@/components/feed";
export default function Page() {
  return <Feed mode="mine" />;
}
