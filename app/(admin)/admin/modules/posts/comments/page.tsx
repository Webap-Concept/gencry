// app/(admin)/admin/modules/posts/comments/page.tsx
//
// Tab admin "Comments" del modulo Posts. Contiene:
//   - Form di configurazione runtime del thread commenti (live mode,
//     cache TTL, body max, reply prefetch, ecc.) — spostato qui dal
//     tab Settings (semanticamente è feature-specific dei commenti).
//   - Overview placeholder: stats + lista commenti recenti, da
//     implementare in PR successiva (oggi solo skeleton).
//
// Quando arriveranno reports/moderation sui commenti, vivranno qui
// dentro come sub-section.
import type { Metadata } from "next";
import { loadCommentsConfig } from "@/lib/modules/posts/comments-config";
import { POSTS_MODULE } from "@/lib/modules/posts/manifest";
import { PostsCommentsSettingsForm } from "../_components/posts-comments-settings-form";

export const metadata: Metadata = { title: "Posts / Comments" };
export const dynamic = "force-dynamic";

export default async function PostsAdminCommentsPage() {
  const commentsConfig = await loadCommentsConfig();

  return (
    <div className="space-y-5">
      <PostsCommentsSettingsForm
        initial={commentsConfig}
        capacityProfile={
          POSTS_MODULE.capacityProfiles?.find((p) => p.scope === "comments")
        }
      />

      {/* Placeholder overview — implementazione completa in PR successiva
          (lista commenti recenti, top authors, stats per post, moderation
          actions). Lo skeleton resta a documentare l'intento di scope. */}
      <div className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 max-w-[720px]">
        <h2 className="text-lg font-semibold text-[var(--admin-text)]">
          Overview
        </h2>
        <p className="text-sm text-[var(--admin-text-muted)] mt-1">
          In arrivo: lista commenti recenti, top authors, stats per post,
          moderation actions (soft-delete come moderatore, filtri per
          autore/post/data).
        </p>
      </div>
    </div>
  );
}
