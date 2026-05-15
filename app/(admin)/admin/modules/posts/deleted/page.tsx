// /admin/modules/posts/deleted — coda dei post soft-deleted
//
// Mostra tutti i post con `deleted_at IS NOT NULL` (sia quelli ancora
// in grace, sia quelli oltre grace in attesa del cron). Il moderatore
// può ripristinare quelli in grace; il cron `hard-delete-deleted` poi
// rimuove fisicamente le righe oltre grace.
import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getDeletedPostsForAdmin } from "@/lib/modules/posts/queries";
import { DeletedPostsClient } from "./_components/deleted-posts-client";

export const metadata: Metadata = { title: "Posts / Deleted" };
export const dynamic = "force-dynamic";

export default async function PostsDeletedPage() {
  const settings = await getAppSettings();
  const graceDays =
    parseInt(settings["modules.posts.deleted_grace_days"], 10) || 7;

  const rows = await getDeletedPostsForAdmin({ graceDays, limit: 100 });

  return <DeletedPostsClient rows={rows} graceDays={graceDays} />;
}
