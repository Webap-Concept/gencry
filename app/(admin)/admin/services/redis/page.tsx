import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { RedisForm } from "./_components/redis-form";

export const metadata: Metadata = { title: "Services / Redis" };

export default async function ServicesRedisPage() {
  const settings = await getAppSettings();
  return <RedisForm settings={settings} />;
}
