"use client";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/auth/middleware";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { toggleMarketingConsentAction } from "../actions";

export type ConsentVM = {
  title: string;
  /** ISO string. null se l'utente non l'ha mai accettato (caso solo marketing). */
  acceptedAt: string | null;
  /** Versione che l'utente ha accettato. null se non accettato. */
  acceptedVersion: string | null;
  /** Versione attualmente pubblicata sul sito. null se la pagina non esiste. */
  currentVersion: string | null;
  /** HTML già sanitizzato lato server. null se non c'è snapshot da mostrare. */
  contentHtml: string | null;
  /** True se la versione accettata è ancora quella attuale. */
  isCurrent: boolean;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Soglia di troncamento del testo legale: ~15 righe a 13px/leading-relaxed.
// Tenuta in px (non rem) perché ResizeObserver e scrollHeight ragionano in px,
// e l'utente non cambia la zoom-aware base-font in questa app.
const TRUNCATE_HEIGHT_PX = 320;

export function ConsentsPanel({
  terms,
  privacy,
  marketing,
}: {
  terms: ConsentVM;
  privacy: ConsentVM;
  marketing: ConsentVM;
}) {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gc-fg">Consensi</h2>
          <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
            Qui trovi le condizioni che hai accettato. I Termini e la Privacy
            Policy sono obbligatori per usare la piattaforma; il consenso
            marketing è facoltativo e puoi modificarlo quando vuoi.
          </p>
        </div>

        <ConsentCard consent={terms} kind="required" />
        <ConsentCard consent={privacy} kind="required" />
        <MarketingCard consent={marketing} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card consenso obbligatorio (Termini, Privacy)
// ---------------------------------------------------------------------------

function ConsentCard({
  consent,
  kind,
}: {
  consent: ConsentVM;
  kind: "required" | "optional";
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-2xl border border-gc-line bg-gc-bg-2">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-gc-fg">
              {consent.title}
            </h3>
            {kind === "required" && (
              <span className="rounded-full bg-gc-bg px-2 py-0.5 text-[11px] font-medium text-gc-fg-3">
                Obbligatorio
              </span>
            )}
            {!consent.isCurrent && consent.acceptedVersion && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Versione aggiornata disponibile
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-gc-fg-3">
            <AcceptanceLine consent={consent} />
          </p>
        </div>

        {consent.contentHtml && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
            {open ? "Nascondi testo" : "Leggi testo accettato"}
          </Button>
        )}
      </header>

      {open && consent.contentHtml && (
        <div className="border-t border-gc-line px-4 py-4">
          <CollapsibleHtmlBody html={consent.contentHtml} />
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Card marketing con toggle on/off
// ---------------------------------------------------------------------------

function MarketingCard({ consent }: { consent: ConsentVM }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    toggleMarketingConsentAction,
    {},
  );

  const isOn = consent.acceptedAt !== null;

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <article className="rounded-2xl border border-gc-line bg-gc-bg-2">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-gc-fg">
              {consent.title}
            </h3>
            <span className="rounded-full bg-gc-bg px-2 py-0.5 text-[11px] font-medium text-gc-fg-3">
              Facoltativo
            </span>
          </div>
          <p className="mt-1 text-[12px] text-gc-fg-3">
            {isOn ? (
              <AcceptanceLine consent={consent} />
            ) : (
              <>Non hai dato il consenso alle comunicazioni marketing.</>
            )}
          </p>
          {state.error && (
            <p className="mt-2 text-[12.5px] text-gc-neg">{state.error}</p>
          )}
        </div>

        <form action={action}>
          {/* Quando vogliamo attivare passiamo enabled=1; quando disattiviamo
              non passiamo niente, e lo schema risolve come false. */}
          {!isOn && <input type="hidden" name="enabled" value="1" />}
          <Button
            type="submit"
            variant={isOn ? "outline" : "default"}
            size="sm"
            disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isOn ? "Disattivazione…" : "Attivazione…"}
              </>
            ) : isOn ? (
              "Disattiva"
            ) : (
              "Attiva"
            )}
          </Button>
        </form>
      </header>

      {consent.contentHtml && (
        <>
          <div className="border-t border-gc-line px-4 py-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-gc-fg-3 hover:text-gc-fg transition-colors">
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open
                ? "Nascondi testo"
                : isOn
                  ? "Leggi testo accettato"
                  : "Leggi informativa"}
            </button>
          </div>
          {open && (
            <div className="border-t border-gc-line px-4 py-4">
              <CollapsibleHtmlBody html={consent.contentHtml} />
            </div>
          )}
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Body HTML con troncamento a ~15 righe e fade-out + bottone "Mostra tutto"
// ---------------------------------------------------------------------------

function CollapsibleHtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Misuro il contenuto reale a prescindere da `expanded`: scrollHeight è
  // sempre l'altezza totale del contenuto, anche quando max-h tronca il
  // visibile (clientHeight). Se sotto la soglia, niente fade né bottone.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      setOverflowing(el.scrollHeight > TRUNCATE_HEIGHT_PX + 1);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  const showTruncation = overflowing && !expanded;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={ref}
          className={cn(
            "prose prose-sm max-w-none text-[13px] leading-relaxed text-gc-fg [&_a]:text-gc-accent [&_h1]:text-[16px] [&_h2]:text-[15px] [&_h3]:text-[14px]",
            showTruncation && "overflow-hidden",
          )}
          style={showTruncation ? { maxHeight: TRUNCATE_HEIGHT_PX } : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {showTruncation && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-gc-bg-2 via-gc-bg-2/70 to-transparent"
          />
        )}
      </div>

      {overflowing && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? "Mostra meno" : "Mostra tutto"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function AcceptanceLine({ consent }: { consent: ConsentVM }) {
  if (!consent.acceptedAt) {
    return <>Mai accettato.</>;
  }
  const date = dateFmt.format(new Date(consent.acceptedAt));
  const version = consent.acceptedVersion ?? "?";

  if (consent.isCurrent) {
    return (
      <>
        Accettato il {date} · versione {version}
      </>
    );
  }

  return (
    <>
      Accettato il {date} · versione {version}
      {consent.currentVersion && (
        <> · versione attuale {consent.currentVersion}</>
      )}
    </>
  );
}
