/**
 * Layout isolato per il frontend pubblico.
 *
 * Si occupa del CSS specifico del frontend e monta il footer pubblico
 * (link legali + bottone preferenze cookie). Gli snippet globali
 * (head/body_end) sono iniettati dal RootLayout in app/layout.tsx,
 * che è l'unico posto in cui next/script strategy="beforeInteractive"
 * viene hoistato nel <head> reale.
 *
 * Layout flex-column: il content prende `flex-1` e il footer resta
 * sempre alla fine. Stesso pattern usato in (login)/layout.tsx — utile
 * anche per il rendering del root not-found.tsx, che Next.js wrappa
 * dentro questo layout quando una rotta (frontend) chiama notFound().
 */
import { PublicFooter } from "@/components/layout/PublicFooter";
import { Suspense } from "react";
import "./frontend.css";

export default function FrontendLayout({
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
