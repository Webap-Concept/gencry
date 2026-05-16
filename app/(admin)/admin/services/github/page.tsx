import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { GitHubCIForm } from "./_components/github-ci-form";

export const metadata: Metadata = { title: "Services / GitHub CI" };

export default async function ServicesGitHubPage() {
  const settings = await getAppSettings();
  return <GitHubCIForm settings={settings} />;
}
