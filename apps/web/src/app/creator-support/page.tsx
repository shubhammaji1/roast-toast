import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Creator support",
  alternates: { canonical: "/creator-support" },
};
import { CoffeeHistory } from "@/components/account";
export default function Page() {
  return <CoffeeHistory />;
}
