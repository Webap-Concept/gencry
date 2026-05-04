// app/(onboarding)/onboarding/page.tsx
//
// Server entry per il wizard. Legge lo stato corrente del profilo
// (username, interessi) e calcola lo step iniziale: il wizard riparte
// dal primo step incompleto se l'utente ha abbandonato e tornato.

import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoinRain } from "@/components/decor/coin-rain";
import { GridBackdrop } from "@/components/decor/grid-backdrop";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Benvenuto" };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const [profile] = await db
    .select({
      username: userProfiles.username,
      interests: userProfiles.interests,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  const initialUsername  = profile?.username  ?? "";
  const initialInterests = profile?.interests ?? [];

  // Step iniziale: il primo non completato
  let initialStep: 0 | 1 | 2 = 0;
  if (initialUsername)              initialStep = 1;
  if (initialInterests.length >= 3) initialStep = 2;

  // `relative overflow-hidden` per clippare le monete che cadono oltre il
  // viewport (animazione +110vh). Il wizard interno è z-10 sopra il backdrop.
  return (
    <div className="relative min-h-dvh overflow-hidden bg-brand-bg">
      <GridBackdrop />
      <CoinRain />
      <div className="relative z-10">
        <OnboardingWizard
          initialStep={initialStep}
          initialUsername={initialUsername}
          initialInterests={initialInterests}
        />
      </div>
    </div>
  );
}
