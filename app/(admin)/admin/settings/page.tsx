import { getAdminPath } from "@/lib/admin-paths";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  redirect(await getAdminPath("settings-general"));
}
