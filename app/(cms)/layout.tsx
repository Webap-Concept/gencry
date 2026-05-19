/**
 * Layout isolato per il frontend pubblico (pagine CMS gestite da admin).
 *
 * Thin wrapper: il chrome (header + rail + footer + logica isNews) vive
 * in `<PublicCmsShell>` condiviso con `app/[locale]/layout.tsx`. Questo
 * layout serve solo a:
 *   1. Settare il request locale dai headers (default IT senza prefix);
 *   2. Delegare il rendering allo shell.
 *
 * Gli snippet globali (head/body_end) sono iniettati dal RootLayout
 * in app/layout.tsx, che è l'unico posto in cui next/script
 * strategy="beforeInteractive" viene hoistato nel <head> reale.
 */
import { PublicCmsShell } from "@/components/layout/PublicCmsShell";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import "./frontend.css";

// Lo shell legge `headers().get('x-pathname')`: senza force-dynamic
// Next 16 può servire una versione cached con pathname stale.
export const dynamic = "force-dynamic";

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  // Niente localePrefix: questo layout cattura solo URL senza prefix
  // locale (le rotte con prefix passano per `app/[locale]/...`).
  return <PublicCmsShell>{children}</PublicCmsShell>;
}
