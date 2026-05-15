import type { Metadata } from "next";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import {
  loadGlobalR2AccountId,
  R2_ACCOUNT_ADMIN_PATH,
} from "@/lib/storage/r2-account";
import { getAllReportReasons } from "@/lib/modules/posts/services/report-reasons";
import { PostsR2SettingsForm } from "../_components/posts-r2-settings-form";
import { ReportReasonsManager } from "./_components/report-reasons-manager";

export const metadata: Metadata = { title: "Posts / Settings" };
export const dynamic = "force-dynamic";

export default async function PostsAdminSettingsPage() {
  const [settings, globalAccountId, adminSlug, reportReasons] = await Promise.all([
    getAppSettings(),
    loadGlobalR2AccountId(),
    getAdminUrlSlug(),
    getAllReportReasons(),
  ]);
  const r2SecretIsSet = Boolean(
    (settings["modules.posts.r2.secret_access_key"] ?? "").trim(),
  );

  return (
    <div className="space-y-5">
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
      <ReportReasonsManager initial={reportReasons} />
    </div>
  );
}
