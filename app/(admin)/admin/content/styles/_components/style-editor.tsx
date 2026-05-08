"use client";

import { css as cssLang } from "@codemirror/lang-css";
import { EditorView } from "@codemirror/view";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { CheckCircle2, RotateCcw, Save, AlertTriangle } from "lucide-react";
import {
  saveCmsStylesAction,
  type SaveCmsStylesState,
} from "../actions";

/**
 * Editor CSS per i contenuti CMS.
 *
 * Persistenza: server action `saveCmsStylesAction` invocata via due form
 * `<form action={action}>` separati con hidden inputs (pattern React 19
 * nativo che evita lo "first click swallowed" tipico di useActionState
 * chiamato programmaticamente da onClick):
 *   - Form save  → input hidden `css` con il valore corrente.
 *   - Form reset → input hidden `reset=1` (action setta DB a null).
 *
 * Source of truth = prop `initialCustom` (server-side). Dopo ogni save,
 * Next esegue automaticamente router.refresh() → la page server-component
 * re-fetcha il setting dal DB e ritorna nuovo `initialCustom`. Il client
 * deriva tutto da quella prop:
 *   - `baseline` = ciò che è realmente salvato sul server adesso
 *   - `hasCustom` = c'è un override custom o no
 *   - `isDirty` = il buffer corrente differisce dal baseline
 * Niente useState dirty-tracking: il refresh server è la verità.
 *
 * `useEffect [initialCustom]` riallinea il buffer locale al baseline
 * quando il server refresh porta un nuovo valore — di fatto solo dopo
 * un save (l'unico evento che cambia initialCustom in questa pagina).
 */
export default function StyleEditor({
  initialCustom,
  defaultStyles,
}: {
  initialCustom: string | null;
  defaultStyles: string;
}) {
  const t = useTranslations("admin.content.styles");

  const baseline = initialCustom ?? defaultStyles;
  const hasCustom =
    initialCustom !== null && initialCustom.trim() !== "";

  // Buffer del CodeMirror. Riallineato al baseline quando il server
  // notifica un cambio (post-save router.refresh).
  const [code, setCode] = useState<string>(baseline);
  useEffect(() => {
    setCode(baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustom]);

  const [state, action, isPending] = useActionState<
    SaveCmsStylesState,
    FormData
  >(saveCmsStylesAction, {} as SaveCmsStylesState);

  // Dopo ogni save andato a buon fine forziamo un router.refresh() —
  // l'action revalida solo /api/cms/styles.css, non questa pagina, quindi
  // senza refresh esplicito il prop `initialCustom` resterebbe stale e
  // l'editor mostrerebbe per sempre "Modifiche non salvate".
  // `lastHandledAt` evita doppio-refresh sullo stesso save.
  const router = useRouter();
  const lastHandledAt = useRef<number | null>(null);
  useEffect(() => {
    if (!state || !("ok" in state) || !state.ok) return;
    if (lastHandledAt.current === state.savedAt) return;
    lastHandledAt.current = state.savedAt;
    router.refresh();
  }, [state, router]);

  const isDirty = code !== baseline;
  const charCount = code.length;
  const charLimit = 200_000;

  const cmTheme = useMemo(
    () =>
      EditorView.theme({
        "&": {
          fontSize: "13px",
          backgroundColor: "var(--admin-page-bg)",
          color: "var(--admin-text)",
          borderRadius: "0.5rem",
          border: "1px solid var(--admin-input-border)",
        },
        ".cm-content": { fontFamily: "ui-monospace, monospace", padding: "12px" },
        ".cm-gutters": {
          backgroundColor: "var(--admin-page-bg)",
          color: "var(--admin-text-faint)",
          border: "none",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--admin-hover-bg)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--admin-hover-bg)",
        },
        "&.cm-focused": {
          outline: "none",
          borderColor: "var(--admin-accent)",
        },
      }),
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{
              background: hasCustom
                ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
                : "var(--admin-hover-bg)",
              color: hasCustom
                ? "var(--admin-accent)"
                : "var(--admin-text-muted)",
              border: hasCustom
                ? "1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)"
                : "1px solid var(--admin-input-border)",
            }}>
            {hasCustom ? <CheckCircle2 size={12} /> : null}
            {hasCustom ? t("statusCustom") : t("statusDefault")}
          </span>
          {isDirty && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px]"
              style={{
                background: "color-mix(in srgb, #f59e0b 12%, transparent)",
                color: "#b45309",
                border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
              }}>
              {t("statusDirty")}
            </span>
          )}
          <span style={{ color: "var(--admin-text-faint)" }}>
            {t("charCount", { count: charCount, limit: charLimit })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {state && "ok" in state && state.ok && !isDirty && (
            <span
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: "#22c55e" }}>
              <CheckCircle2 size={13} />
              {state.reset ? t("savedReset") : t("saved")}
            </span>
          )}
          {state && "error" in state && state.error && (
            <span
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: "#ef4444" }}>
              <AlertTriangle size={13} />
              {state.error === "tooLong"
                ? t("errorTooLong", { limit: charLimit })
                : t("errorSave")}
            </span>
          )}

          <form action={action}>
            <input type="hidden" name="reset" value="1" />
            <button
              type="submit"
              disabled={isPending || !hasCustom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "transparent",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text-muted)",
              }}>
              <RotateCcw size={13} />
              {t("resetButton")}
            </button>
          </form>

          <form action={action}>
            <input type="hidden" name="css" value={code} />
            <button
              type="submit"
              disabled={isPending || !isDirty}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "var(--admin-accent)",
                color: "white",
                border: "none",
              }}>
              <Save size={13} />
              {isPending ? t("savingButton") : t("saveButton")}
            </button>
          </form>
        </div>
      </div>

      <CodeMirror
        value={code}
        height="560px"
        extensions={[cssLang(), cmTheme, EditorView.lineWrapping]}
        onChange={(v) => setCode(v)}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          indentOnInput: true,
          autocompletion: true,
          bracketMatching: true,
        }}
      />

      <p
        className="text-xs"
        style={{ color: "var(--admin-text-faint)", lineHeight: 1.6 }}>
        {t("helperText")}
      </p>
    </div>
  );
}
