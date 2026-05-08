// app/(admin)/admin/seo/not-found/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  countFilteredNotFoundLogs,
  countNotFoundLogs,
  listNotFoundLogs,
} from "@/lib/db/not-found-queries";
import {
  clearResolvedNotFoundAction,
  clearSystemPathsNotFoundAction,
  deleteNotFoundAction,
  reopenNotFoundAction,
  resolveNotFoundAction,
} from "./actions";
import NotFoundClient from "./_components/not-found-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.seo.notFound");
  return { title: t("metaTitle") };
}

type SearchParams = Promise<{
  show?: string;
  page?: string;
  q?: string;
}>;

const PER_PAGE = 50;

export default async function NotFoundMonitorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const includeResolved = sp.show === "all";
  const search = sp.q?.trim() ?? "";
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [rows, counts, filteredTotal] = await Promise.all([
    listNotFoundLogs({
      includeResolved,
      limit: PER_PAGE,
      offset: (requestedPage - 1) * PER_PAGE,
      search,
    }),
    countNotFoundLogs(),
    countFilteredNotFoundLogs({ includeResolved, search }),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PER_PAGE));
  const page = Math.min(requestedPage, totalPages);

  return (
    <NotFoundClient
      rows={rows}
      counts={counts}
      includeResolved={includeResolved}
      page={page}
      totalPages={totalPages}
      perPage={PER_PAGE}
      filteredTotal={filteredTotal}
      initialSearch={search}
      resolveAction={resolveNotFoundAction}
      reopenAction={reopenNotFoundAction}
      deleteAction={deleteNotFoundAction}
      clearResolvedAction={clearResolvedNotFoundAction}
      clearSystemPathsAction={clearSystemPathsNotFoundAction}
    />
  );
}
