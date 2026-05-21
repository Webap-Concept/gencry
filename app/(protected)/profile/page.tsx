// app/(protected)/profile/page.tsx
//
// Backward-compat redirect: la pagina profilo è migrata a /u/<username>
// (decisione 2026-05-21 — vedi project_profile_page_plan). Vecchi link
// e bookmark verso /profile finiscono qui e vengono inoltrati alla
// nuova URL personale dell'utente loggato.
//
// Se l'utente non ha username (raro: pre-onboarding), redirect a
// /settings/profile per completare il setup.
import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";

export default async function ProfileLegacyRedirect() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/profile");
  if (user.username) redirect(`/u/${user.username}`);
  redirect("/settings/profile");
}
