import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { LogIn } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GoogleOAuthForm } from "./_components/google-oauth-form";

export const metadata: Metadata = { title: "Services / Google OAuth" };

export default async function ServicesGoogleOAuthPage() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={LogIn}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.google-oauth.label")}
        subtitle={t("sections.google-oauth.description")}
      />
      <GoogleOAuthForm settings={settings} />
    </>
  );
}
