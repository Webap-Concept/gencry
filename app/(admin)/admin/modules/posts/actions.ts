"use server";
// app/(admin)/admin/modules/posts/actions.ts
//
// Admin Server Actions per il modulo Posts. Per ora coprono solo:
//   - savePostsR2Settings — salva le 5 chiavi R2 (con sentinel
//     per il secret così la UI non lo re-invia tutte le volte)
//   - testPostsR2Connection — HeadBucket per validare credenziali
//
// Gated da `modules:posts` permission.

import { requireAdmin } from "@/lib/rbac/guards";
import { updateAppSetting } from "@/lib/db/settings-queries";
import {
  checkPostsR2Connection,
  loadPostsR2Config,
  normalizePublicBaseUrl,
  type PostsR2ConnectionResult,
} from "@/lib/modules/posts/storage";

const SECRET_SENTINEL = "********";

type ActionResult = { ok: true } | { ok: false; error: string };

export type SavePostsR2SettingsInput = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string; // SECRET_SENTINEL = "non cambiare"
  bucket: string;
  publicBaseUrl: string;
};

export async function savePostsR2Settings(
  input: SavePostsR2SettingsInput,
): Promise<ActionResult> {
  await requireAdmin();

  const accountId       = input.accountId.trim();
  const accessKeyId     = input.accessKeyId.trim();
  const bucket          = input.bucket.trim();
  // normalizePublicBaseUrl: prepend https:// se l'admin scrive solo
  // "media.example.com" senza schema. Senza questo l'<img src> nel
  // frontend risulta un relative path e il browser lo manda a
  // localhost/media.example.com/... finendo nel catch-all CMS.
  const publicBaseUrl   = normalizePublicBaseUrl(input.publicBaseUrl);

  await updateAppSetting("modules.posts.r2.account_id",      accountId);
  await updateAppSetting("modules.posts.r2.access_key_id",   accessKeyId);
  await updateAppSetting("modules.posts.r2.bucket",          bucket || "social-media");
  await updateAppSetting("modules.posts.r2.public_base_url", publicBaseUrl);

  // Secret: aggiorna solo se diverso dal sentinel
  if (input.secretAccessKey !== SECRET_SENTINEL) {
    await updateAppSetting(
      "modules.posts.r2.secret_access_key",
      input.secretAccessKey.trim(),
    );
  }

  return { ok: true };
}

export async function testPostsR2Connection(): Promise<PostsR2ConnectionResult> {
  await requireAdmin();
  const cfg = await loadPostsR2Config();
  if (!cfg) return { ok: false, reason: "missing_config" };
  return checkPostsR2Connection(cfg);
}
