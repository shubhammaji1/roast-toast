import { Suspense } from "react";
import { IdeaDetail } from "@/components/detail";
import { Loading } from "@/components/ui";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <IdeaDetail id={id} />
    </Suspense>
  );
}
