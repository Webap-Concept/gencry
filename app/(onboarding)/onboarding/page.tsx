// app/(onboarding)/onboarding/page.tsx
//
// Server entry per il wizard. Legge lo stato corrente del profilo
// (username, coin picks, risk profile) e calcola lo step iniziale: il wizard
// riparte dal primo step incompleto se l'utente ha abbandonato e tornato.

import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { userProfiles } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  COIN_PICKS_MIN,
  getTopCoins,
  getUserCoinPicks,
  getUserRiskProfile,
} from "@/lib/modules/onboarding/queries";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CoinRain } from "@/components/decor/coin-rain";
import { GridBackdrop } from "@/components/decor/grid-backdrop";
import { OnboardingWizard } from "./wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.page");
  return { title: t("title") };
}

const RISK_PROFILES   = new Set(["cauto", "moderato", "aggressivo", "degen"]);
const EXPERIENCE_KEYS = new Set(["newbie", "1to3y", "over3y"]);

type RiskProfile = "cauto" | "moderato" | "aggressivo" | "degen";
type Experience  = "newbie" | "1to3y" | "over3y";

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  // Se l'admin ha disabilitato il wizard globalmente (toggle in
  // /admin/modules/onboarding), saltiamo direttamente in app.
  const settings = await getAppSettings();
  if (settings["modules.onboarding.enabled"] === "false") redirect("/");

  // Stato persistito + lista top coin in parallelo
  const [profileRow, coinPicks, riskRow, topCoins] = await Promise.all([
    db
      .select({ username: userProfiles.username })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)
      .then((rows) => rows[0]),
    getUserCoinPicks(user.id),
    getUserRiskProfile(user.id),
    getTopCoins(),
  ]);

  const initialUsername = profileRow?.username ?? "";
  const hasUsername     = Boolean(initialUsername);

  // Sanitize valori risk arrivati dal DB (CHECK constraint li garantisce
  // ma type-safety lato TS richiede un narrowing esplicito)
  const initialRisk =
    riskRow &&
    RISK_PROFILES.has(riskRow.profile) &&
    EXPERIENCE_KEYS.has(riskRow.experience)
      ? {
          profile: riskRow.profile as RiskProfile,
          experience: riskRow.experience as Experience,
        }
      : null;

  // Step iniziale logico (0=username, 1=coins, 2=risk, 3=done):
  //   - se manca username → 0
  //   - else se coin_picks < min → 1
  //   - else se risk profile manca → 2
  //   - else → 3
  let initialStep: 0 | 1 | 2 | 3 = 0;
  if (hasUsername)                       initialStep = 1;
  if (hasUsername && coinPicks.length >= COIN_PICKS_MIN) initialStep = 2;
  if (hasUsername && coinPicks.length >= COIN_PICKS_MIN && initialRisk) initialStep = 3;

  // `relative overflow-hidden` per clippare le monete che cadono oltre il
  // viewport (animazione +110vh). Il wizard interno è z-10 sopra il backdrop.
  return (
    <div className="relative min-h-dvh overflow-hidden bg-brand-bg">
      <GridBackdrop />
      <CoinRain />
      <div className="relative z-10">
        <OnboardingWizard
          initialStep={initialStep}
          hasUsername={hasUsername}
          initialUsername={initialUsername}
          initialCoinPicks={coinPicks}
          initialRisk={initialRisk}
          topCoins={topCoins}
        />
      </div>
    </div>
  );
}
