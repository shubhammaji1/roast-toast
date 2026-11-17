import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Coffee support",
  alternates: { canonical: "/coffee-history" },
};
import { redirect } from "next/navigation";
export default function Page() {
  redirect("/creator-support");
}
