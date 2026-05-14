import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import {
  loadGlobalR2AccountId,
  R2_ACCOUNT_ADMIN_PATH,
} from "@/lib/storage/r2-account";
import { PostsR2SettingsForm } from "../_components/posts-r2-settings-form";

export const metadata: Metadata = { title: "Posts / Settings" };
export const dynamic = "force-dynamic";

export default async function PostsAdminSettingsPage() {
  const [settings, globalAccountId, adminSlug] = await Promise.all([
    getAppSettings(),
    loadGlobalR2AccountId(),
    getAdminUrlSlug(),
  ]);
  const r2SecretIsSet = Boolean(
    (settings["modules.posts.r2.secret_access_key"] ?? "").trim(),
  );

  return (
    <PostsR2SettingsForm
      initial={{
        accessKeyId:   (settings["modules.posts.r2.access_key_id"]   ?? "").trim(),
        bucket:        (settings["modules.posts.r2.bucket"]          ?? "social-media").trim(),
        publicBaseUrl: (settings["modules.posts.r2.public_base_url"] ?? "").trim(),
        r2SecretIsSet,
      }}
      globalAccountId={globalAccountId}
      cloudflareSettingsHref={`/${adminSlug}${R2_ACCOUNT_ADMIN_PATH}`}
    />
  );
}
