import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Reset password",
  alternates: { canonical: "/reset-password" },
};
import { ResetPassword } from "@/components/account";
export default function Page() {
  return <ResetPassword />;
}
