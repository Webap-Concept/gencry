import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { GoogleOAuthForm } from "./_components/google-oauth-form";

export const metadata: Metadata = { title: "Services / Google OAuth" };

export default async function ServicesGoogleOAuthPage() {
  const settings = await getAppSettings();
  return <GoogleOAuthForm settings={settings} />;
}
