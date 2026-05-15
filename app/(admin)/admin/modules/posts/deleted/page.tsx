// /admin/modules/posts/deleted — coda dei post soft-deleted
//
// Mostra tutti i post con `deleted_at IS NOT NULL` (sia quelli ancora
// in grace, sia quelli oltre grace in attesa del cron). Il moderatore
// può ripristinare quelli in grace; il cron `hard-delete-deleted` poi
// rimuove fisicamente le righe oltre grace.
//
// Filtro pill ?filter=author|moderator|all (default all) per distinguere
// chi ha eseguito il delete — vedi badge nella card lato client.
import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  getDeletedPostsForAdmin,
  type DeletedPostsFilter,
} from "@/lib/modules/posts/queries";
import { DeletedPostsClient } from "./_components/deleted-posts-client";

export const metadata: Metadata = { title: "Posts / Deleted" };
export const dynamic = "force-dynamic";

const VALID_FILTERS: DeletedPostsFilter[] = ["all", "author", "moderator"];

function parseFilter(raw: string | undefined): DeletedPostsFilter {
  return (VALID_FILTERS as string[]).includes(raw ?? "")
    ? (raw as DeletedPostsFilter)
    : "all";
}

export default async function PostsDeletedPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.filter);

  const settings = await getAppSettings();
  const graceDays =
    parseInt(settings["modules.posts.deleted_grace_days"], 10) || 7;

  const page = await getDeletedPostsForAdmin({
    graceDays,
    filter,
    limit: 25,
  });

  return (
    <DeletedPostsClient
      initial={page}
      graceDays={graceDays}
      filter={filter}
    />
  );
}
