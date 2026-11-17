import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Your space",
  alternates: { canonical: "/profile" },
};
import { ProfilePage } from "@/components/account";
export default function Page() {
  return <ProfilePage />;
}
