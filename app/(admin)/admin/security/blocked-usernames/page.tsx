// app/(admin)/admin/security/blocked-usernames/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/rbac/guards";
import { db } from "@/lib/db/drizzle";
import { blockedUsernames } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { BlockedUsernamesClient } from "./_components/blocked-usernames-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.blockedUsernames");
  return { title: t("metaTitle") };
}

async function BlockedUsernamesContent() {
  const rows = await db
    .select({ username: blockedUsernames.username, isPattern: blockedUsernames.isPattern })
    .from(blockedUsernames)
    .orderBy(asc(blockedUsernames.username));
  return <BlockedUsernamesClient initialEntries={rows} />;
}

export default async function AdminBlockedUsernamesPage() {
  await requireAdminPage();

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-40">
          <div
            className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "var(--admin-accent)", borderTopColor: "transparent" }}
          />
        </div>
      }
    >
      <BlockedUsernamesContent />
    </Suspense>
  );
}
