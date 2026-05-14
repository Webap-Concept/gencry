import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { PostsR2SettingsForm } from "../_components/posts-r2-settings-form";

export const metadata: Metadata = { title: "Posts / Settings" };
export const dynamic = "force-dynamic";

export default async function PostsAdminSettingsPage() {
  const settings = await getAppSettings();
  // Sicurezza: il secret R2 NON viaggia mai al client. Passiamo solo
  // un boolean che indica se è valorizzato; la UI mostra "********".
  const r2SecretIsSet = Boolean(
    (settings["modules.posts.r2.secret_access_key"] ?? "").trim(),
  );

  return (
    <PostsR2SettingsForm
      initial={{
        accountId:     (settings["modules.posts.r2.account_id"]      ?? "").trim(),
        accessKeyId:   (settings["modules.posts.r2.access_key_id"]   ?? "").trim(),
        bucket:        (settings["modules.posts.r2.bucket"]          ?? "social-media").trim(),
        publicBaseUrl: (settings["modules.posts.r2.public_base_url"] ?? "").trim(),
        r2SecretIsSet,
      }}
    />
  );
}
