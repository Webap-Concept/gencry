// app/(admin)/admin/access/business/page.tsx
//
// Coda di approvazione delle richieste di account azienda. L'admin verifica
// i dati (P.IVA, sito, settore) e approva o rifiuta. RBAC `admin:users`
// (gate nel layout). Solo richieste 'pending'.

import { listPendingBusinessRequests } from "@/lib/account/business-profile";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { BusinessRequestsTable } from "./_components/business-requests-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.access.business");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function BusinessRequestsPage() {
  const t = await getTranslations("admin.access.business");
  const requests = await listPendingBusinessRequests();

  return (
    <div>
      <AdminSectionHeader
        icon={Building2}
        breadcrumbLabel={t("pageTitle")}
        subtitle={t("pageSubtitle", { count: requests.length })}
      />

      <BusinessRequestsTable requests={requests} />
    </div>
  );
}
