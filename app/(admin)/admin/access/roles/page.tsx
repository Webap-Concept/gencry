import { getAdminRoles } from "@/lib/db/roles-queries";
import { requireAdminPage } from "@/lib/rbac/guards";
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

  return (
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
  );
}
