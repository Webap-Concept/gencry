// app/(onboarding)/layout.tsx
//
// Guard del flow di onboarding:
// - Se non c'è sessione → /sign-in
// - Se l'utente ha già completato l'onboarding → home (o /admin per gli admin)
// - Altrimenti renderizza il wizard

import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { users } from "@/lib/db/schema";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  const user = await getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [row] = await db
    .select({ completedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (row?.completedAt) {
    // Onboarding già completato → out. Il flusso admin ha entry dedicato.
    redirect("/");
  }

  return <>{children}</>;
}
