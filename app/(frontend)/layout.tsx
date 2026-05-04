/**
 * Layout isolato per il frontend pubblico.
 *
 * Si occupa del CSS specifico del frontend e monta il footer pubblico
 * (link legali + bottone preferenze cookie). Gli snippet globali
 * (head/body_end) sono iniettati dal RootLayout in app/layout.tsx,
 * che è l'unico posto in cui next/script strategy="beforeInteractive"
 * viene hoistato nel <head> reale.
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
    <>
      {children}
      {/* Suspense: PublicFooter è async (legge settings + cookie consent).
          Fallback null così il contenuto si mostra subito anche se i dati
          del footer arrivano a streaming. */}
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </>
  );
}
