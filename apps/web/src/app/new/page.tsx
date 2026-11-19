import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Pitch an idea",
  alternates: { canonical: "/new" },
};
import { IdeaEditor } from "@/components/editor";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>;
}) {
  const { auth } = await searchParams;
  return <IdeaEditor authMode={auth === "signin" ? "signin" : "signup"} />;
}
