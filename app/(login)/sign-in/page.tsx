import { generatePageMetadata } from "@/lib/seo";
import { getAppSettings } from "@/lib/db/settings-queries";
import { Suspense } from "react";
import { connection } from "next/server";
import { Login } from "../login";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  // Opt-in dynamic: senza questo, durante "Generating static pages" su
  // Vercel Next prova a prerenderare la pagina e finisce in timeout >60s
  // (la query getAppSettings() su Supabase EU + cold connection durante
  // la build supera il limite). Pattern già fixato qui in passato (commit
  // 379fecd) e poi rimosso per errore in c2d7b20 — la regressione si è
  // ripresentata solo quando la build cache di Vercel è stata invalidata.
  // `connection()` è la versione "cacheComponents-friendly" di force-dynamic.
  await connection();
  return generatePageMetadata("/sign-in");
}

async function SignInContent() {
  const settings = await getAppSettings();
  const isMaintenance = settings.maintenance_mode === "true";
  return (
    <Login
      mode="signin"
      isMaintenance={isMaintenance}
      turnstileSiteKey={settings.cf_turnstile_site_key}
    />
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
