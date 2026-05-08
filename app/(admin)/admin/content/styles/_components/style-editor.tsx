"use client";

import { css as cssLang } from "@codemirror/lang-css";
import { EditorView } from "@codemirror/view";
import { useTranslations } from "next-intl";
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
 * Sorgente: `app_settings[cms.custom_css]` (override) con fallback al
 * default seed (lib/cms/default-styles.ts). Il CodeMirror parte dal
 * valore custom se presente, altrimenti dal default — così l'admin vede
 * subito le regole correnti e può iterare.
 *
 * Persistenza: server action `saveCmsStylesAction` (stesso file in actions.ts).
 * Bottone "Ripristina default" passa `reset=1` → action setta DB a null →
 * il route handler ritornerà di nuovo il default seed.
 *
 * Il preview live non c'è (per ora): le pagine CMS si servono dall'API
 * con cache HTTP 5min, l'admin ricarica la CMS page in un'altra tab dopo
 * il save per vedere il risultato.
 */
export default function StyleEditor({
  initialCustom,
  defaultStyles,
}: {
  initialCustom: string | null;
  defaultStyles: string;
}) {
  const t = useTranslations("admin.content.styles");

  // Stato editor: parte dal custom se presente, altrimenti dal default seed.
  // `isCustom` segnala se il DB ha un override attivo — usato per il banner
  // "Stai usando il default" vs "Override personalizzato attivo".
  const [code, setCode] = useState<string>(initialCustom ?? defaultStyles);
  const [hasCustom, setHasCustom] = useState<boolean>(
    initialCustom !== null && initialCustom.trim() !== "",
  );
  const initialRef = useRef(initialCustom ?? defaultStyles);

  const [state, action, isPending] = useActionState<
    SaveCmsStylesState,
    FormData
  >(saveCmsStylesAction, {} as SaveCmsStylesState);

  // Allinea l'UI dopo un save/reset andato a buon fine. Il setState qui
  // riallinea `initialRef` così il "dirty" indicator riparte da capo.
  useEffect(() => {
    if (!state || !("ok" in state) || !state.ok) return;
    if (state.reset) {
      // Reset → il DB ora è null, l'editor torna a mostrare il default
      setCode(defaultStyles);
      initialRef.current = defaultStyles;
      setHasCustom(false);
    } else {
      // Save normale → il DB ha il valore corrente, ripartiamo da lì
      initialRef.current = code;
      setHasCustom(code.trim() !== "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isDirty = code !== initialRef.current;
  const charCount = code.length;
  const charLimit = 200_000;

  // Theme CodeMirror — niente OneDark (heavy + non corrisponde al theme admin).
  // Custom minimal: background trasparente, font monospace coerente.
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

  function handleSave(reset: boolean) {
    const fd = new FormData();
    if (reset) {
      fd.set("reset", "1");
    } else {
      fd.set("css", code);
    }
    action(fd);
  }

  return (
    <div className="space-y-4">
      {/* Header status: indicatore custom/default + dirty */}
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
          {state && "ok" in state && state.ok && (
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

          <button
            type="button"
            onClick={() => handleSave(true)}
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
          <button
            type="button"
            onClick={() => handleSave(false)}
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
        </div>
      </div>

      {/* Editor */}
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
