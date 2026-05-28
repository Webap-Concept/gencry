// components/social-graph/HomeEmptyBanner.tsx
//
// Banner mostrato sopra il feed Home quando l'utente non segue ancora
// nessuno. Sotto il banner: SuggestedFollowsRow + il feed che cade su
// discovery (gestito da getHomeFeedIds).
import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function HomeEmptyBanner() {
  const t = await getTranslations("socialGraph.home_empty_banner");
  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-xl p-5 flex items-start gap-4">
      <div
        aria-hidden
        className="shrink-0 w-10 h-10 rounded-full bg-gc-accent/10 flex items-center justify-center text-gc-accent"
      >
        <Compass size={20} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gc-fg">{t("title")}</h2>
        <p className="text-sm text-gc-fg-muted mt-1">{t("description")}</p>
      </div>
    </div>
  );
}
