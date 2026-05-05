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
import { setRequestLocaleFromHeaders } from "@/lib/i18n/server";
import { Suspense } from "react";
import "./frontend.css";

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await setRequestLocaleFromHeaders();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* flex flex-col qui: rende il children-wrapper un flex container,
          così le pagine che vogliono stretchare lo sfondo a tutta l'altezza
          disponibile (es. la 404) possono usare `flex-1` sul proprio
          container. Le pagine che non lo fanno mantengono la stessa
          impaginazione di prima (block flow naturale). */}
      <div className="flex flex-1 flex-col">{children}</div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
