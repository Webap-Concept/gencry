/**
 * Layout del group `(public)` (rotte SEO-friendly che cambiano
 * presentazione in base allo stato utente).
 *
 * ⚠️ Passthrough by design: NON wrappa lo shell qui dentro. Lo shell
 * adattivo (header marketing per anonimi / ProtectedShell per loggati
 * / right rail / footer) sta in `<PublicAdaptiveShell>` ed è
 * applicato dalle SINGOLE page del group. La ragione: se lo shell
 * fosse qui, ogni `notFound()` chiamato da una page del group avrebbe
 * il root `app/not-found.tsx` wrappato da questo layout — sidebar e
 * right rail attorno alla 404, esattamente quello che non vogliamo.
 *
 * Lasciando il layout passthrough, l'unwind del `NEXT_NOT_FOUND`
 * raggiunge il root layout SENZA passare di qui → la 404 esce
 * full-page sia per loggati che per anonimi.
 *
 * Convenzione per le page in `(public)`: wrappare il proprio return in
 * `<PublicAdaptiveShell>` esplicitamente. Il rituale è il prezzo da
 * pagare perché la 404 funzioni come pagina indipendente.
 */
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import "@/app/(frontend)/frontend.css";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  return children;
}
