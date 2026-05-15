import { DEFAULT_CMS_STYLES } from "@/lib/cms/default-styles";
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import StyleEditor from "./_components/style-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.styles");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function ContentStylesPage() {
  // Lettura diretta della key — evitiamo getAppSettings() (che leggerebbe TUTTI
  // i settings) per non pagare round-trip su una pagina che ne usa uno solo.
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "cms.custom_css"))
    .limit(1);
  const stored = rows[0]?.value ?? null;

  return (
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
  );
}
