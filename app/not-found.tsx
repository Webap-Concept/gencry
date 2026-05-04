import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { after } from "next/server";
import { Crash404 } from "@/components/not-found/Crash404";
import { logNotFoundHit } from "@/lib/seo/log-not-found";

export const metadata = {
  title: "404 — Pagina non trovata · Generazione Crypto",
  description: "L'asset che cercavi non è in portafoglio.",
};

export default async function NotFound() {
  // Il proxy (vedi proxy.ts) imposta `x-pathname` su ogni request: usiamolo
  // per sapere QUALE URL ha generato il 404. Senza questo, dal not-found.tsx
  // non avremmo modo di recuperare il pathname originario.
  const h = await headers();
  const pathname = h.get("x-pathname");
  const referrer = h.get("referer");
  const userAgent = h.get("user-agent");

  // `after()` esegue il callback DOPO che la response è stata inviata
  // all'utente: l'INSERT/UPDATE non aggiunge latenza percepita al 404.
  after(async () => {
    await logNotFoundHit({ pathname, referrer, userAgent });
  });

  // Niente wrapper flex/min-h e niente PublicFooter: quando notFound() viene
  // chiamato da una rotta sotto (frontend), Next applica già FrontendLayout
  // che wrappa in flex-col min-h-screen e monta il footer pubblico.
  return (
    <div className="relative w-full overflow-x-hidden bg-gc-bg text-gc-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--gc-line) 1px, transparent 1px), linear-gradient(90deg, var(--gc-line) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          backgroundPosition: "-1px -1px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 80%)",
        }}
      />

      <nav className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 md:px-8 md:py-6">
        <Link
          href="/"
          className="flex items-center gap-3 font-bold tracking-tight text-gc-fg no-underline">
          <Image
            src="/gc_logo.svg"
            alt="Generazione Crypto"
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg object-contain"
            priority
          />
          <span className="flex flex-col leading-[1.05]">
            <span className="text-base">Generazione</span>
            <span className="text-base font-bold text-gc-accent">Crypto</span>
          </span>
        </Link>

        <div className="inline-flex items-center gap-2 rounded-full border border-gc-line bg-gc-bg-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-gc-fg-3">
          <span className="h-[7px] w-[7px] animate-gc-blink rounded-full bg-gc-neg" />
          Errore 404 · Pagina non trovata
        </div>
      </nav>

      <Crash404 />
    </div>
  );
}
