import { db } from "@/lib/db/drizzle";
import { pages, roles } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { SignUpTab } from "../tabs/signup-tab";

export const metadata: Metadata = { title: "Settings / SignUp" };

export default async function SettingsSignInPage() {
  const [settings, allRoles, systemPages] = await Promise.all([
    getAppSettings(),
    db.select().from(roles).orderBy(asc(roles.sortOrder)),
    db
      .select({
        id: pages.id, // necessario per il link /admin/content/pages/{id}/edit
        systemKey: pages.systemKey,
        contentVersion: pages.contentVersion,
        slug: pages.slug,
        title: pages.title,
        updatedAt: pages.updatedAt,
      })
      .from(pages)
      .where(eq(pages.isSystem, true)),
  ]);

  return (
    <SignUpTab settings={settings} roles={allRoles} systemPages={systemPages} />
  );
}
