import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { generatePageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Login } from "../login";

export async function generateMetadata(): Promise<Metadata> {
  // Opt-in dynamic — vedi commento equivalente in sign-in/page.tsx.
  await connection();
  return generatePageMetadata("/sign-up");
}

export default async function SignUpPage() {
  // Opt-in dynamic del rendering — vedi commento in sign-in/page.tsx
  // SignInContent. Il connection() in generateMetadata da solo non basta.
  await connection();
  const [systemPageSlugs, settings] = await Promise.all([
    getSystemPageSlugs(),
    getAppSettings(),
  ]);

  return (
    <Suspense>
      <Login
        mode="signup"
        isMaintenance={false}
        systemPageSlugs={systemPageSlugs}
        turnstileSiteKey={settings.cf_turnstile_site_key}
      />
    </Suspense>
  );
}
