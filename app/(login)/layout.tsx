import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Suspense } from "react";
import "@/app/(frontend)/frontend.css";

/**
 * Layout per le pagine di login pubbliche (sign-in, sign-up, forgot-password,
 * reset-password, verify-email, verify-device, staff-invite). Header e
 * footer condivisi col resto del frontend pubblico.
 */
export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  const appSettings = await getAppSettingsSafe();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <PublicHeader appLogoUrl={appSettings.app_logo_url} />
      <div className="flex-1">{children}</div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
