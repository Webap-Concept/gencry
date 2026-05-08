import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { DEFAULT_CMS_STYLES } from "@/lib/cms/default-styles";
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Palette } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import StyleEditor from "./_components/style-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.styles");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function ContentStylesPage() {
  const t = await getTranslations("admin.content.styles");

  // Lettura diretta della key — evitiamo getAppSettings() (che leggerebbe TUTTI
  // i settings) per non pagare round-trip su una pagina che ne usa uno solo.
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "cms.custom_css"))
    .limit(1);
  const stored = rows[0]?.value ?? null;

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Palette}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        infoSlot={
          <AdminSectionInfo
            title={t("guideTitle")}
            ariaLabel={t("guideAriaLabel")}>
            <p>{t("guideIntro")}</p>
            <ul>
              <li>{t("guideBullet1")}</li>
              <li>{t("guideBullet2")}</li>
              <li>{t("guideBullet3")}</li>
            </ul>
          </AdminSectionInfo>
        }
      />

      <div
        className="rounded-xl shadow-sm p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <StyleEditor
          initialCustom={stored}
          defaultStyles={DEFAULT_CMS_STYLES}
        />
      </div>
    </div>
  );
}
