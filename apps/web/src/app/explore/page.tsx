import { Feed } from "@/components/feed";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <Feed key={q} mode="explore" initialQuery={q || ""} />;
}
