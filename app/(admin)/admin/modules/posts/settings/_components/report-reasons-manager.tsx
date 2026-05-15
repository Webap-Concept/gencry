"use client";
// app/(admin)/admin/modules/posts/settings/_components/report-reasons-manager.tsx
//
// Editor admin per la lista admin-editable di "Motivi di segnalazione"
// del modulo Posts. La lista è salvata in app_settings come JSON
// (modules.posts.report_reasons). Vedi lib/modules/posts/services/
// report-reasons.ts per il contract.
//
// UX:
//   - Lista di card riordinabili (frecce ↑↓, niente dnd per ridurre scope)
//   - Toggle enabled inline per ogni riga
//   - Edit / Delete inline (dialog per la form completa di una reason)
//   - "Aggiungi motivo" in cima apre la stessa dialog vuota
//   - Save batch a fondo pagina: invia l'intera lista al Server Action
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReportReason } from "@/lib/modules/posts/services/report-reasons";
import { saveReportReasonsAction } from "../actions";

type Props = { initial: ReportReason[] };

const EMPTY_REASON: ReportReason = {
  key: "",
  labelByLocale: { it: "", en: "" },
  descriptionByLocale: { it: "", en: "" },
  icon: "",
  enabled: true,
  requiresDetails: false,
  position: 0,
};

function isValidKey(key: string): boolean {
  return /^[a-z0-9_]{1,40}$/.test(key);
}

export function ReportReasonsManager({ initial }: Props) {
  const [reasons, setReasons] = useState<ReportReason[]>(() =>
    [...initial].sort((a, b) => a.position - b.position),
  );
  const [editing, setEditing] = useState<{
    idx: number | null;
    draft: ReportReason;
  } | null>(null);
  const [isSaving, startSave] = useTransition();
  const [saveMsg, setSaveMsg] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const move = (idx: number, delta: -1 | 1) => {
    const j = idx + delta;
    if (j < 0 || j >= reasons.length) return;
    const next = [...reasons];
    [next[idx], next[j]] = [next[j], next[idx]];
    setReasons(next.map((r, i) => ({ ...r, position: i })));
  };

  const toggleEnabled = (idx: number) => {
    setReasons((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const openEdit = (idx: number) => {
    setEditing({ idx, draft: { ...reasons[idx] } });
  };

  const openAdd = () => {
    setEditing({
      idx: null,
      draft: { ...EMPTY_REASON, position: reasons.length },
    });
  };

  const commitEditing = () => {
    if (!editing) return;
    const draft = editing.draft;
    if (!isValidKey(draft.key)) return;
    if (!draft.labelByLocale.it || !draft.labelByLocale.en) return;

    setReasons((prev) => {
      if (editing.idx === null) {
        return [...prev, draft].map((r, i) => ({ ...r, position: i }));
      }
      return prev.map((r, i) => (i === editing.idx ? draft : r));
    });
    setEditing(null);
  };

  const removeReason = (idx: number) => {
    if (!confirm("Eliminare questo motivo?")) return;
    setReasons((prev) =>
      prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, position: i })),
    );
  };

  const onSave = () => {
    setSaveMsg(null);
    startSave(async () => {
      const res = await saveReportReasonsAction(reasons);
      if (res.ok) setSaveMsg({ kind: "ok", text: "Salvato." });
      else setSaveMsg({ kind: "error", text: res.error });
    });
  };

  return (
    <section
      className="rounded-xl shadow-sm p-5 space-y-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Motivi di segnalazione
          </h3>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Lista mostrata nel modal &quot;Segnala post&quot; lato frontend.
            Le modifiche hanno effetto immediato dopo il salvataggio (cache
            settings ~5min).
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white shrink-0"
          style={{ background: "var(--admin-accent)" }}>
          <Plus size={13} />
          Aggiungi motivo
        </button>
      </header>

      <ul className="space-y-2">
        {reasons.map((r, idx) => (
          <li
            key={`${r.key}-${idx}`}
            className="rounded-lg p-3 flex items-center gap-3"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-card-border)",
              opacity: r.enabled ? 1 : 0.55,
            }}>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label="Sposta su"
                className="p-0.5 disabled:opacity-30">
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === reasons.length - 1}
                aria-label="Sposta giù"
                className="p-0.5 disabled:opacity-30">
                <ArrowDown size={12} />
              </button>
            </div>
            <span className="text-lg shrink-0 w-6 text-center">
              {r.icon || "•"}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                style={{ color: "var(--admin-text)" }}>
                {r.labelByLocale.it || r.key}
                {r.requiresDetails ? (
                  <span
                    className="ml-2 text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--admin-text-faint)" }}>
                    dettagli obbl.
                  </span>
                ) : null}
              </p>
              <p
                className="text-[11px] mt-0.5 font-mono"
                style={{ color: "var(--admin-text-faint)" }}>
                key: {r.key} · IT: {r.labelByLocale.it || "—"} · EN:{" "}
                {r.labelByLocale.en || "—"}
              </p>
            </div>
            <label
              className="flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0"
              style={{ color: "var(--admin-text-muted)" }}>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={() => toggleEnabled(idx)}
              />
              attivo
            </label>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openEdit(idx)}
                aria-label="Modifica motivo"
                className="p-1.5 rounded transition-colors"
                style={{ color: "var(--admin-text-faint)" }}>
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => removeReason(idx)}
                aria-label="Elimina motivo"
                className="p-1.5 rounded transition-colors"
                style={{ color: "var(--gc-neg, #dc2626)" }}>
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
        {reasons.length === 0 ? (
          <li
            className="text-xs italic text-center py-6"
            style={{ color: "var(--admin-text-faint)" }}>
            Nessun motivo. Aggiungine uno per attivare il modal Segnala.
          </li>
        ) : null}
      </ul>

      <footer className="flex items-center justify-between pt-2">
        <p
          className="text-[11px]"
          style={{
            color:
              saveMsg?.kind === "error"
                ? "var(--gc-neg, #dc2626)"
                : saveMsg?.kind === "ok"
                  ? "var(--admin-accent)"
                  : "var(--admin-text-faint)",
          }}>
          {saveMsg?.text ??
            "Ricorda di salvare dopo aver modificato l'ordine o i toggle."}
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white disabled:opacity-50"
          style={{ background: "var(--admin-accent)" }}>
          {isSaving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          Salva modifiche
        </button>
      </footer>

      {editing ? (
        <ReasonEditDialog
          isNew={editing.idx === null}
          draft={editing.draft}
          onChange={(d) => setEditing((cur) => (cur ? { ...cur, draft: d } : cur))}
          onCancel={() => setEditing(null)}
          onCommit={commitEditing}
        />
      ) : null}
    </section>
  );
}

function ReasonEditDialog({
  isNew,
  draft,
  onChange,
  onCancel,
  onCommit,
}: {
  isNew: boolean;
  draft: ReportReason;
  onChange: (d: ReportReason) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const keyOk = isValidKey(draft.key);
  const labelsOk = draft.labelByLocale.it && draft.labelByLocale.en;
  const canSave = keyOk && labelsOk;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo motivo" : "Modifica motivo"}</DialogTitle>
          <DialogDescription>
            Le label IT e EN sono obbligatorie. La key è l&apos;identificatore
            persistito su DB (lowercase + underscore, max 40 char).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Key (identifier)">
            <input
              type="text"
              value={draft.key}
              onChange={(e) =>
                onChange({ ...draft, key: e.target.value.toLowerCase().trim() })
              }
              disabled={!isNew}
              placeholder="es. market_manipulation"
              className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm font-mono"
            />
            {!keyOk && draft.key ? (
              <p className="text-[11px] text-gc-danger mt-1">
                Solo lowercase, cifre e underscore, max 40 caratteri.
              </p>
            ) : null}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Label IT">
              <input
                type="text"
                value={draft.labelByLocale.it ?? ""}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    labelByLocale: {
                      ...draft.labelByLocale,
                      it: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm"
              />
            </Field>
            <Field label="Label EN">
              <input
                type="text"
                value={draft.labelByLocale.en ?? ""}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    labelByLocale: {
                      ...draft.labelByLocale,
                      en: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Descrizione IT">
              <input
                type="text"
                value={draft.descriptionByLocale?.it ?? ""}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    descriptionByLocale: {
                      ...(draft.descriptionByLocale ?? {}),
                      it: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm"
              />
            </Field>
            <Field label="Descrizione EN">
              <input
                type="text"
                value={draft.descriptionByLocale?.en ?? ""}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    descriptionByLocale: {
                      ...(draft.descriptionByLocale ?? {}),
                      en: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 items-end">
            <Field label="Icona (emoji o testo)">
              <input
                type="text"
                value={draft.icon ?? ""}
                onChange={(e) => onChange({ ...draft, icon: e.target.value })}
                placeholder="📈"
                className="w-full px-3 py-2 rounded-lg border border-gc-line bg-gc-bg text-sm"
              />
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  onChange({ ...draft, enabled: e.target.checked })
                }
              />
              Abilitato
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.requiresDetails}
                onChange={(e) =>
                  onChange({ ...draft, requiresDetails: e.target.checked })
                }
              />
              Dettagli obbl.
            </label>
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm">
            Annulla
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={onCommit}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--admin-accent)" }}>
            Conferma
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-gc-fg-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
