"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveGitHubCISettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const repo = ((formData.get("github_repo") as string) ?? "").trim();
    const pat = ((formData.get("github_pat") as string) ?? "").trim();
    const branch = ((formData.get("github_ci_branch") as string) ?? "").trim();

    // Validazione formato "owner/repo" se presente
    if (repo && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
      return {
        error: t("githubCISaveInvalidRepoFormat"),
        timestamp: Date.now(),
      };
    }

    await updateAppSetting("github_repo", repo || null);
    await updateAppSetting("github_pat", pat || null);
    await updateAppSetting("github_ci_branch", branch || null);

    revalidatePath(getAdminPath("services-github"));
    revalidatePath("/admin/tests");
    return { success: t("githubCISaved"), timestamp: Date.now() };
  } catch {
    return { error: t("githubCISaveFailed"), timestamp: Date.now() };
  }
}

export async function testGitHubCISettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.services.actionMessages");
  try {
    const repo = ((formData.get("github_repo") as string | null) ?? "").trim();
    const pat = ((formData.get("github_pat") as string | null) ?? "").trim();
    const branch = (((formData.get("github_ci_branch") as string | null) ?? "").trim() || "ci-results");

    if (!repo || !pat) {
      return { error: t("githubCITestRepoTokenRequired"), timestamp: Date.now() };
    }

    const url = `https://api.github.com/repos/${repo}/contents/vitest-results.json?ref=${branch}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (res.status === 401) {
      return { error: t("githubCITestInvalidToken"), timestamp: Date.now() };
    }
    if (res.status === 403) {
      return { error: t("githubCITestInsufficientPermissions"), timestamp: Date.now() };
    }
    if (res.status === 404) {
      return {
        error: t("githubCITestBranchNotFound", { branch }),
        timestamp: Date.now(),
      };
    }
    if (!res.ok) {
      return {
        error: t("githubCITestApiResponded", { status: res.status }),
        timestamp: Date.now(),
      };
    }

    return { success: t("githubCITestOk", { branch }), timestamp: Date.now() };
  } catch {
    return { error: t("githubCITestNetworkFailed"), timestamp: Date.now() };
  }
}
