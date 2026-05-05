// app/(preview)/layout.tsx
// Route group isolato per /admin/preview/*
// NON eredita il layout admin (niente sidebar, niente topbar).
// Include solo il CSS admin per i colori della PreviewBar e il font.
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Manrope } from "next/font/google";
import "@/app/(admin)/admin.css";

const manrope = Manrope({ subsets: ["latin"] });

export default async function PreviewRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  return (
    <div className={manrope.className} style={{ minHeight: "100dvh" }}>
      {children}
    </div>
  );
}
