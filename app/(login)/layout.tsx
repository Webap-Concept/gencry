import { PublicFooter } from "@/components/layout/PublicFooter";
import { Suspense } from "react";

/**
 * Layout per le pagine di login pubbliche (sign-in, sign-up, forgot-password,
 * reset-password, verify-email, verify-device, staff-invite). Monta il
 * footer condiviso col frontend pubblico così visitatori anonimi possono
 * accedere ai link legali e modificare le preferenze cookie senza dover
 * essere autenticati.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex-1">{children}</div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
