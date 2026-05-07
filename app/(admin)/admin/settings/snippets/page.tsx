import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getCookieRegistry } from "@/lib/db/cookie-services-queries";
import { getAllSnippets } from "@/lib/db/snippets-queries";
import { Code2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SnippetsTab, type CookieServiceOption } from "../tabs/snippets-tab";

export const metadata: Metadata = { title: "Settings / Snippets" };

export default async function SettingsContenutiPage() {
  const [snippets, registry, t] = await Promise.all([
    getAllSnippets(),
    getCookieRegistry(),
    getTranslations("admin.settings"),
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
  const cookieServiceOptions: CookieServiceOption[] = registry.services.map((s) => ({
    id: s.id,
    name: trMap.get(s.id) ?? s.id,
    categoryId: s.categoryId,
  }));

  return (
    <>
      <AdminSectionHeader
        icon={Code2}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.snippets.label")}
        subtitle={t("sections.snippets.description")}
      />
      <SnippetsTab
        initialSnippets={snippets}
        cookieServices={cookieServiceOptions}
      />
    </>
  );
}
