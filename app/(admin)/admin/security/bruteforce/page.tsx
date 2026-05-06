import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { requireAdminPage } from "@/lib/rbac/guards";
import { getBruteforceData } from "./actions";
import { BruteforceClient } from "./_components/bruteforce-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.bruteforce");
  return { title: t("metaTitle") };
}

async function BruteforceContent() {
  const data = await getBruteforceData();
  return <BruteforceClient {...data} />;
}

export default async function AdminBruteforcePage() {
  await requireAdminPage();
  const t = await getTranslations("admin.security");
  const tBf = await getTranslations("admin.security.bruteforce");

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ShieldAlert}
        breadcrumbLabel={t("breadcrumb")}
        title={tBf("pageTitle")}
        subtitle={tBf("pageSubtitle")}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--admin-accent)", borderTopColor: "transparent" }}
            />
          </div>
        }
      >
        <BruteforceContent />
      </Suspense>
    </div>
  );
}
