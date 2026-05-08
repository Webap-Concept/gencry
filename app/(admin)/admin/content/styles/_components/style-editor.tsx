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
 * Persistenza: server action `saveCmsStylesAction`. Per evitare i quirks
 * di `useActionState` chiamato programmaticamente (in alcune versioni
 * React 19 il primo invocation veniva swallowato), invochiamo l'action
 * via due `<form action={action}>` separati con hidden input — il
 * pattern React 19 nativo per Server Actions:
 *   - Form "save"  → input hidden `css` con il valore corrente.
 *   - Form "reset" → input hidden `reset=1`, action setta DB a null.
 *
 * I bottoni sono `type="submit"` dentro i propri form. Niente onClick,
 * niente FormData costruita a mano: il browser invia automaticamente
 * tutti gli `<input>` del form.
 */
export default function StyleEditor({
  initialCustom,
  defaultStyles,
}: {
  initialCustom: string | null;
  defaultStyles: string;
}) {
  const t = useTranslations("admin.content.styles");

  const [code, setCode] = useState<string>(initialCustom ?? defaultStyles);
  const [hasCustom, setHasCustom] = useState<boolean>(
    initialCustom !== null && initialCustom.trim() !== "",
  );
  const initialRef = useRef(initialCustom ?? defaultStyles);

  const [state, action, isPending] = useActionState<
    SaveCmsStylesState,
    FormData
  >(saveCmsStylesAction, {} as SaveCmsStylesState);

  // Allinea l'UI dopo un save/reset andato a buon fine. Usiamo il
  // savedAt come trigger così re-eseguiamo l'effect solo quando l'action
  // ritorna un nuovo successo (state.ok === true riferito a uno stato
  // "fresh"); i ri-render senza cambio di stato non ci toccano.
  useEffect(() => {
    if (!state || !("ok" in state) || !state.ok) return;
    if (state.reset) {
      setCode(defaultStyles);
      initialRef.current = defaultStyles;
      setHasCustom(false);
    } else {
      // Il valore persistito è quello che stava nell'editor al submit:
      // lo prendiamo da `initialRef`-shadow `code` corrente (chiusura
      // sul render in cui state è cambiato). Più sicuro: nascondi un
      // input "css" che riflette code e leggi state.savedAt come token.
      initialRef.current = code;
      setHasCustom(code.trim() !== "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isDirty = code !== initialRef.current;
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

          {/* Form Reset — submit con hidden `reset=1`. L'action setta DB
              a null e l'effect lato client riallinea l'editor al default. */}
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

          {/* Form Save — submit con hidden `css` = valore corrente
              dell'editor. Hidden viene letto dal browser al submit, niente
              construzione manuale di FormData né invocation programmatica
              (fix per "primo click non salva" su React 19 useActionState). */}
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
