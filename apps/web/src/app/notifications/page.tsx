import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Notifications",
  alternates: { canonical: "/notifications" },
};
import { NotificationsPage } from "@/components/account";
export default function Page() {
  return <NotificationsPage />;
}
