import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAssets } from "@/lib/db/media-queries";
import { Image as ImageIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { MediaUploader } from "./_components/media-uploader";
import { MediaGrid } from "./_components/media-grid";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const t = await getTranslations("admin.content.media");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const [assets, t] = await Promise.all([
    getAssets({ folderId: null }),
    getTranslations("admin.content.media"),
  ]);

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={ImageIcon}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <div
        className="rounded-xl shadow-sm p-5 space-y-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <MediaUploader />
        <MediaGrid assets={assets} />
      </div>
    </div>
  );
}
