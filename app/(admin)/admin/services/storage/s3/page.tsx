import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { getAppSettings } from "@/lib/db/settings-queries";
import { HardDrive } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { S3Form } from "./_components/s3-form";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: "Services / Storage / S3" };
}

export default async function ServicesStorageS3Page() {
  const [settings, t] = await Promise.all([
    getAppSettings(),
    getTranslations("admin.services"),
  ]);
  return (
    <>
      <AdminSectionHeader
        icon={HardDrive}
        breadcrumbLabel={t("rootTitle")}
        title={t("sections.s3.label")}
        subtitle={t("sections.s3.description")}
      />
      <S3Form settings={settings} />
    </>
  );
}
