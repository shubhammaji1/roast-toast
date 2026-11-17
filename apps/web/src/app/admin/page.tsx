import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Moderation",
  alternates: { canonical: "/admin" },
};
import { AdminPage } from "@/components/account";
export default function Page() {
  return <AdminPage />;
}
