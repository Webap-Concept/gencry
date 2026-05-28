// app/(public)/u/[username]/followers/page.tsx
//
// Lista dei follower di un utente. SSR, paginazione "load more" sotto.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicAdaptiveShell } from "@/components/layout/PublicAdaptiveShell";
import { FollowListPage } from "@/components/social-graph/FollowListPage";
import { listFollowers } from "@/lib/modules/social-graph/queries";
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
  const title = `${t("followers_label")} · @${profile.username}`;
  return generatePageMetadata(`/u/${profile.username.toLowerCase()}/followers`, {
    title,
  });
}

export default async function FollowersListPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const firstPage = await listFollowers(profile.userId, null);

  return (
    <PublicAdaptiveShell>
      <FollowListPage
        direction="followers"
        profile={profile}
        initialItems={firstPage.items}
        initialNextCursor={firstPage.nextCursor}
      />
    </PublicAdaptiveShell>
  );
}
