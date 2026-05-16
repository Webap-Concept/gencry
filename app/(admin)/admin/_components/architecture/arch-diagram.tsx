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
//
// Click-to-expand: il container è cliccabile, apre una AdminDialog
// fullscreen (95vw × 90vh) col diagramma re-renderizzato grande. La
// chunk mermaid è già caricata, il render in modale costa ~10ms.
import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import {
  AdminDialog,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";

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
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <figure className="my-4">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Espandi diagramma a tutto schermo"
          className="group relative w-full text-left rounded-2xl p-5 overflow-x-auto cursor-zoom-in transition-colors block"
          style={{
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <span
            className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
              color: "var(--admin-accent)",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)",
            }}>
            <Maximize2 size={11} />
            Espandi
          </span>
          <MermaidSvg id={id} source={source} />
        </button>
        {caption ? (
          <figcaption
            className="mt-2 text-xs text-center"
            style={{ color: "var(--admin-text-faint)" }}>
            {caption}
          </figcaption>
        ) : null}
      </figure>

      {/* Modale fullscreen. Il diagramma viene re-renderizzato con un
          id distinto (mermaid richiede id univoci). La chunk mermaid è
          già in cache, render ~10ms. Mounting solo on-demand: niente
          lavoro se la modale non si apre mai. */}
      <AdminDialog open={expanded} onOpenChange={setExpanded}>
        <AdminDialogContent
          title={caption ?? "Diagramma"}
          size="xl"
          className="!max-w-[95vw] !w-[95vw]">
          <div
            className="overflow-auto rounded-xl p-4"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-card-border)",
              maxHeight: "82vh",
              minHeight: "60vh",
            }}>
            {expanded ? (
              <MermaidSvg id={`${id}-expanded`} source={source} expanded />
            ) : null}
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}

/**
 * Render core. Tirato fuori da ArchDiagram così possiamo usarlo sia
 * nella card sia nella modale, con id distinti per evitare collisioni
 * mermaid (richiede id univoci per render).
 */
function MermaidSvg({
  id,
  source,
  expanded = false,
}: {
  id: string;
  source: string;
  expanded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = await loadMermaid();

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
            fontSize:            expanded ? "16px" : "13px",
          },
          flowchart: { curve: "basis", htmlLabels: false },
          er:        { useMaxWidth: !expanded },
        });

        const { svg } = await mermaid.render(`${id}-svg`, source);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;

          // In modalità expanded forziamo l'SVG a riempire orizzontalmente
          // e a scalare proporzionalmente — Mermaid mette width/height
          // fissi che limitano la leggibilità in modale.
          if (expanded) {
            const svgEl = containerRef.current.querySelector("svg");
            if (svgEl) {
              svgEl.removeAttribute("style");
              svgEl.setAttribute("width", "100%");
              svgEl.setAttribute("height", "auto");
              svgEl.style.maxWidth = "100%";
              svgEl.style.height = "auto";
            }
          }

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
  }, [source, id, expanded]);

  if (error) {
    return (
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
    );
  }

  return (
    <>
      {!rendered ? (
        <div
          className="flex items-center justify-center py-12 text-xs"
          style={{ color: "var(--admin-text-faint)" }}>
          Carico diagramma…
        </div>
      ) : null}
      <div ref={containerRef} className="flex justify-center" />
    </>
  );
}
