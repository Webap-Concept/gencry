"use client";
// app/(admin)/admin/_components/architecture/arch-diagram.tsx
//
// Render lato client di un diagramma Mermaid. Carico la libreria via
// dynamic import dentro l'useEffect → niente impatto sul bundle delle
// altre pagine admin (mermaid pesa ~400KB minified, va in un chunk
// separato che entra in scena solo su /modules/<slug>/architecture).
//
// Sicurezza: securityLevel: 'strict' → niente HTML labels arbitrari.
// Le sorgenti dei diagrammi sono comunque hardcoded nel TSX, mai
// user-input.
//
// Theming: passiamo i color tokens admin via themeVariables così il
// diagramma rispetta light/dark mode senza JS extra (li leggiamo da
// getComputedStyle al mount; se cambia il tema il diagramma viene
// ri-renderizzato grazie al `key` sul container).
//
// Fallback: in caso di errore (import fallisce, syntax error, JS
// disabilitato) mostriamo la sorgente Mermaid in <pre> — è già
// leggibile, niente info persa.
import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;

/**
 * Singleton lazy-load. Evita di reimportare mermaid se ci sono N
 * diagrammi sulla stessa pagina (e ce ne sono 2 per modulo).
 */
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
}

type Props = {
  /** Sorgente Mermaid (graph TD / erDiagram / sequenceDiagram). */
  source: string;
  /** Caption opzionale sotto il diagramma. */
  caption?: string;
  /** ID univoco per il render — Mermaid lo richiede. */
  id: string;
};

export function ArchDiagram({ source, caption, id }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = await loadMermaid();

        // Leggi i token admin dal CSS root così il diagramma usa
        // gli stessi colori del resto della pagina.
        const cs = getComputedStyle(document.documentElement);
        const bg     = cs.getPropertyValue("--admin-card-bg").trim()    || "#ffffff";
        const text   = cs.getPropertyValue("--admin-text").trim()       || "#0f172a";
        const border = cs.getPropertyValue("--admin-card-border").trim()|| "#e2e8f0";
        const accent = cs.getPropertyValue("--admin-accent").trim()     || "#3b82f6";

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor:        accent,
            primaryTextColor:    text,
            primaryBorderColor:  accent,
            lineColor:           border,
            secondaryColor:      bg,
            tertiaryColor:       bg,
            background:          bg,
            mainBkg:             bg,
            nodeBorder:          border,
            clusterBkg:          bg,
            clusterBorder:       border,
            textColor:           text,
            fontFamily:          "ui-sans-serif, system-ui, sans-serif",
            fontSize:            "13px",
          },
          flowchart: { curve: "basis", htmlLabels: false },
          er:        { useMaxWidth: true },
        });

        const { svg } = await mermaid.render(`${id}-svg`, source);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "render_failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, id]);

  return (
    <figure className="my-4">
      <div
        className="rounded-2xl p-5 overflow-x-auto"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        {error ? (
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--gc-warning-fg)" }}>
              Errore rendering diagramma. Sorgente Mermaid:
            </p>
            <pre
              className="text-xs overflow-x-auto p-3 rounded-lg"
              style={{
                background: "var(--admin-card-bg)",
                color: "var(--admin-text-muted)",
                border: "1px solid var(--admin-card-border)",
              }}>
              {source}
            </pre>
          </div>
        ) : (
          <>
            {/* Spinner discreto mentre la chunk mermaid carica. */}
            {!rendered ? (
              <div
                className="flex items-center justify-center py-12 text-xs"
                style={{ color: "var(--admin-text-faint)" }}>
                Carico diagramma…
              </div>
            ) : null}
            <div
              ref={containerRef}
              className="flex justify-center"
              style={{ minHeight: rendered ? 0 : 0 }}
            />
          </>
        )}
      </div>
      {caption ? (
        <figcaption
          className="mt-2 text-xs text-center"
          style={{ color: "var(--admin-text-faint)" }}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
