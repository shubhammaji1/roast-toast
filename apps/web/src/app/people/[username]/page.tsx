import { ProfilePage } from "@/components/account";
export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <ProfilePage username={username} />;
}
