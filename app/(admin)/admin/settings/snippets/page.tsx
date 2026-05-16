import { getCookieRegistry } from "@/lib/db/cookie-services-queries";
import { getAllSnippets } from "@/lib/db/snippets-queries";
import type { Metadata } from "next";
import { SnippetsTab, type CookieServiceOption } from "../tabs/snippets-tab";

export const metadata: Metadata = { title: "Settings / Snippets" };

export default async function SettingsContenutiPage() {
  const [snippets, registry] = await Promise.all([
    getAllSnippets(),
    getCookieRegistry(),
  ]);

  // Lista flat dei servizi disponibili per il dropdown del form snippet.
  // Mostra TUTTI i servizi (anche disabled) così l'admin può collegare
  // uno snippet a un tracker temporaneamente sospeso senza perdere il link.
  // Il name visualizzato è la traduzione DEFAULT_LOCALE; l'id (es. "meta_pixel")
  // resta sempre il valore tecnico del FK.
  const trMap = new Map<string, string>();
  for (const tr of registry.translations) {
    if (tr.locale === "it" || (!trMap.has(tr.serviceId) && tr.locale === "en")) {
      trMap.set(tr.serviceId, tr.name);
    }
  }
  const cookieServiceOptions: CookieServiceOption[] = registry.services.map(
    (s) => ({
      id: s.id,
      name: trMap.get(s.id) ?? s.id,
      categoryId: s.categoryId,
    }),
  );

  return (
    <SnippetsTab
      initialSnippets={snippets}
      cookieServices={cookieServiceOptions}
    />
  );
}
