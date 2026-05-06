// app/(admin)/admin/seo/not-found/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  countNotFoundLogs,
  listNotFoundLogs,
} from "@/lib/db/not-found-queries";
import {
  clearResolvedNotFoundAction,
  deleteNotFoundAction,
  reopenNotFoundAction,
  resolveNotFoundAction,
} from "./actions";
import NotFoundClient from "./_components/not-found-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.seo.notFound");
  return { title: t("metaTitle") };
}

type SearchParams = Promise<{ show?: string }>;

export default async function NotFoundMonitorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const includeResolved = sp.show === "all";

  const [rows, counts] = await Promise.all([
    listNotFoundLogs({ includeResolved, limit: 200 }),
    countNotFoundLogs(),
  ]);

  return (
    <NotFoundClient
      rows={rows}
      counts={counts}
      includeResolved={includeResolved}
      resolveAction={resolveNotFoundAction}
      reopenAction={reopenNotFoundAction}
      deleteAction={deleteNotFoundAction}
      clearResolvedAction={clearResolvedNotFoundAction}
    />
  );
}
