import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminUrlForm } from "./_components/admin-url-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.adminUrl");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function AdminUrlPage() {
  const [t, currentSlug] = await Promise.all([
    getTranslations("admin.security"),
    getAdminUrlSlug(),
  ]);

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Link2}
        breadcrumbLabel={t("breadcrumb")}
        title={t("adminUrl.pageTitle")}
        subtitle={t("adminUrl.pageSubtitle")}
      />

      <AdminUrlForm currentSlug={currentSlug} />
    </div>
  );
}
