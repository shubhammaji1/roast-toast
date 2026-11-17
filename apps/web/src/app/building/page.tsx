import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Ideas being built",
  alternates: { canonical: "/building" },
};
import { Feed } from "@/components/feed";
export default function Page() {
  return <Feed mode="building" />;
}
