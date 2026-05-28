// app/(public)/u/[username]/following/page.tsx
//
// Lista delle persone seguite da un utente. SSR + load-more.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { FollowListPage } from "@/components/social-graph/FollowListPage";
import { listFollowing } from "@/lib/modules/social-graph/queries";
import { getProfileByUsername } from "@/lib/profile/queries";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: "—" };
  const t = await getTranslations("socialGraph.stats");
  const title = `${t("following_label")} · @${profile.username}`;
  return generatePageMetadata(`/u/${profile.username.toLowerCase()}/following`, {
    title,
  });
}

export default async function FollowingListPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const firstPage = await listFollowing(profile.userId, null);

  return (
    <PublicAdaptiveShell>
      <FollowListPage
        direction="following"
        profile={profile}
        initialItems={firstPage.items}
        initialNextCursor={firstPage.nextCursor}
      />
    </PublicAdaptiveShell>
  );
}
