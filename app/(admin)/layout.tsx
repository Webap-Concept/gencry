// app/(admin)/layout.tsx
// Questo layout wrappa TUTTO il gruppo (admin):
// - /admin/sign-in  → solo font + bg, NESSUNA shell/sidebar
// - /admin/*        → la shell completa è nel layout interno app/(admin)/admin/layout.tsx
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Manrope } from "next/font/google";
import "./admin.css";

const manrope = Manrope({ subsets: ["latin"] });

export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PR-1b: locale dall'header x-locale (cookie/Accept-Language/default).
  // PR-5 sovrascriverà con users.locale per l'admin staff loggato.
  await setRequestLocaleFromHeaders();
  return (
    <div
      className={`min-h-screen ${manrope.className}`}
      style={{ background: "var(--admin-page-bg)" }}>
      {children}
    </div>
  );
}
