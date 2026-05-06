import { getAdminRoles } from "@/lib/db/roles-queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RolesManager } from "./_components/roles-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.access.roles");
  return { title: t("metaTitle") };
}

async function RolesContent() {
  const roles = await getAdminRoles();
  return <RolesManager roles={roles} />;
}

export default async function AdminRolesPage() {
  await requireAdminPage();
  const t = await getTranslations("admin.access.roles");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <ShieldCheck size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}>
            <span style={{ color: "var(--admin-text-muted)" }}>
              {t("breadcrumbUsers")}
            </span>
            <span style={{ color: "var(--admin-text-faint)" }}> / </span>
            <span>{t("pageTitle")}</span>
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("pageSubtitle")}
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: "var(--admin-accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        }>
        <RolesContent />
      </Suspense>
    </div>
  );
}
