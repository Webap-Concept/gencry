// app/(protected)/_components/policy-reconsent-slot.tsx
// Server component che incapsula la logica del banner re-consent
// (fetch pending consents + grace_days → mode banner/blocking + slugs).
// Riusabile tra i layout protected e (public) loggato — una sola fonte
// di verità, niente duplicazione tra layout.
//
// Restituisce null se l'utente non ha policy pendenti. Errori DB sono
// catturati e degradano a "niente banner" (più safe del crash).

import { getPendingReconsents } from "@/lib/account/policy-reconsent";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import type { PolicyNotificationKey } from "@/lib/db/schema";
import { PolicyReconsentBanner } from "./policy-reconsent-banner";

export async function PolicyReconsentSlot({ userId }: { userId: string }) {
  let reconsent: Awaited<ReturnType<typeof getPendingReconsents>>;
  try {
    reconsent = await getPendingReconsents(userId);
  } catch (err) {
    // DB hiccup: meglio "niente banner" che 500 sul layout.
    console.error("[PolicyReconsentSlot] fetch failed:", err);
    return null;
  }

  if (reconsent.items.length === 0) return null;

  const slugsRaw = await getSystemPageSlugs();
  const slugs: Partial<Record<PolicyNotificationKey, string>> = {
    terms: slugsRaw.terms,
    privacy: slugsRaw.privacy,
    marketing: slugsRaw.marketing,
  };

  let bannerMode: "banner" | "blocking" = "banner";
  let daysRemaining: number | null = null;
  if (reconsent.oldestEnqueuedAt) {
    const elapsed = Date.now() - reconsent.oldestEnqueuedAt.getTime();
    if (elapsed >= reconsent.graceMs) {
      bannerMode = "blocking";
      daysRemaining = 0;
    } else {
      daysRemaining = Math.max(
        0,
        Math.ceil((reconsent.graceMs - elapsed) / (24 * 60 * 60 * 1000)),
      );
    }
  }

  return (
    <PolicyReconsentBanner
      items={reconsent.items.map((i) => ({
        policyKey: i.policyKey,
        newVersion: i.newVersion,
        acceptedVersion: i.acceptedVersion,
      }))}
      slugs={slugs}
      mode={bannerMode}
      daysRemaining={daysRemaining}
    />
  );
}
