import type { Metadata } from "next";
import { WorkspaceAccount } from "@/components/workspace-account";
import { Suspense } from "react";
export const metadata: Metadata = {
  title: "Save my workspace",
  alternates: { canonical: "/account" },
};
export default function Page() {
  return (
    <Suspense fallback={<p>Loading your account…</p>}>
      <WorkspaceAccount />
    </Suspense>
  );
}
