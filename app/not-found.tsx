import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { logNotFoundHit } from "@/lib/seo/log-not-found";

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

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[var(--brand-bg)] px-4">
      <div className="max-w-sm w-full text-center space-y-8">
        <div className="flex justify-center">
          <svg
            viewBox="0 0 120 80"
            width="160"
            height="107"
            fill="none"
            aria-hidden="true">
            {/* Libro sinistra 3 */}
            <rect
              x="8"
              y="28"
              width="28"
              height="42"
              rx="3"
              fill="var(--brand-accent)"
              opacity="0.5"
            />
            <rect
              x="8"
              y="28"
              width="4"
              height="42"
              rx="2"
              fill="var(--brand-accent)"
            />
            <line
              x1="16"
              y1="38"
              x2="32"
              y2="38"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.7"
            />
            <line
              x1="16"
              y1="44"
              x2="28"
              y2="44"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.7"
            />
            <line
              x1="16"
              y1="50"
              x2="30"
              y2="50"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.7"
            />

            {/* Libro centro (più grande, inclinato) */}
            <g transform="rotate(-6 60 50)">
              <rect
                x="42"
                y="18"
                width="36"
                height="52"
                rx="3"
                fill="var(--brand-primary)"
                opacity="0.85"
              />
              <rect
                x="42"
                y="18"
                width="5"
                height="52"
                rx="2"
                fill="var(--brand-primary)"
              />
              <line
                x1="52"
                y1="30"
                x2="74"
                y2="30"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
              <line
                x1="52"
                y1="37"
                x2="74"
                y2="37"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
              <line
                x1="52"
                y1="44"
                x2="68"
                y2="44"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
              <line
                x1="52"
                y1="51"
                x2="72"
                y2="51"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.6"
              />
            </g>

            {/* Libro destra */}
            <rect
              x="84"
              y="32"
              width="26"
              height="38"
              rx="3"
              fill="var(--brand-accent)"
              opacity="0.35"
            />
            <rect
              x="84"
              y="32"
              width="4"
              height="38"
              rx="2"
              fill="var(--brand-accent)"
              opacity="0.6"
            />
            <line
              x1="92"
              y1="42"
              x2="106"
              y2="42"
              stroke="var(--brand-text-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.5"
            />
            <line
              x1="92"
              y1="48"
              x2="104"
              y2="48"
              stroke="var(--brand-text-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.5"
            />

            {/* Punto interrogativo */}
            <text
              x="60"
              y="12"
              textAnchor="middle"
              fontSize="14"
              fontWeight="bold"
              fill="var(--brand-primary)"
              opacity="0.9">
              ?
            </text>
          </svg>
        </div>

        {/* Testo */}
        <div className="space-y-3">
          <p
            className="text-7xl font-extrabold tracking-tight"
            style={{ color: "var(--brand-primary)" }}>
            404
          </p>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--brand-text)" }}>
            Pagina non trovata
          </h1>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--brand-text-muted)" }}>
            Questa pagina non esiste o è stata spostata.
            <br />
            Torna alla home e riprendi a leggere.
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] transition-colors">
          ← Torna alla home
        </Link>
      </div>
    </div>
  );
}
