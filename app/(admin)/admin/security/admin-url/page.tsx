import { getAdminUrlSlug } from "@/lib/admin-paths";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminUrlForm } from "./_components/admin-url-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.adminUrl");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function AdminUrlPage() {
  const currentSlug = await getAdminUrlSlug();
  return <AdminUrlForm currentSlug={currentSlug} />;
}
