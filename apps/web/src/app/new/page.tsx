import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Pitch an idea",
  alternates: { canonical: "/new" },
};
import { IdeaEditor } from "@/components/editor";
export default function Page() {
  return <IdeaEditor />;
}
