import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { db } from "@/lib/db/drizzle";
import { pages, roles } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { asc, eq } from "drizzle-orm";
import { LogIn } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignUpTab } from "../tabs/signup-tab";
import { SignupFlowDiagram } from "./_components/signup-flow-diagram";

export const metadata: Metadata = { title: "Settings / SignUp" };

export default async function SettingsSignInPage() {
  const [settings, allRoles, systemPages, t, tFlow] = await Promise.all([
    getAppSettings(),
    db.select().from(roles).orderBy(asc(roles.sortOrder)),
    db
      .select({
        id: pages.id,           // necessario per il link /admin/content/pages/{id}/edit
        systemKey: pages.systemKey,
        contentVersion: pages.contentVersion,
        slug: pages.slug,
        title: pages.title,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .where(eq(pages.isSystem, true)),
    getTranslations("admin.settings"),
    getTranslations("admin.settings.signup.flowDiagram"),
  ]);

  return (
    <>
      <AdminSectionHeader
        icon={LogIn}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.signup.label")}
        subtitle={t("sections.signup.description")}
        infoSlot={
          <AdminSectionInfo title={tFlow("modalTitle")} ariaLabel={tFlow("trigger")}>
            <SignupFlowDiagram />
          </AdminSectionInfo>
        }
      />
      <SignUpTab settings={settings} roles={allRoles} systemPages={systemPages} />
    </>
  );
}
