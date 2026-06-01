// components/modules/rewards/UserBadgesStrip.tsx
//
// "Bacheca badge" del profilo: badge attivi di un utente (acquistati dal
// catalogo GCC o di sistema). RSC self-contained: fetcha i propri dati e li
// passa serializzati al render client ProfileBadges (che usa il Tooltip
// condiviso → sfondo verde tema + freccetta). Caricato SOLO via dynamic
// import guardato da isModuleInstalled("rewards") nella profile page.
import { getUserActiveBadges } from "@/lib/modules/rewards/catalog-queries";
import { ProfileBadges, type ProfileBadgeItem } from "./ProfileBadges";

export default async function UserBadgesStrip({ userId }: { userId: string }) {
  const badges = await getUserActiveBadges(userId);
  if (badges.length === 0) return null;

  const items: ProfileBadgeItem[] = badges.map((b) => ({
    id: b.id,
    label: b.catalog?.label ?? b.badgeSlug,
    iconUrl: b.catalog?.iconUrl ?? null,
    iconBg: b.catalog?.iconBg ?? null,
  }));

  return <ProfileBadges items={items} />;
}
