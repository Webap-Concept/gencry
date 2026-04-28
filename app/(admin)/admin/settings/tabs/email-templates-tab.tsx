// app/(admin)/admin/settings/tabs/email-templates-tab.tsx
"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveEmailTemplateSettings, type ActionState } from "../actions";

// ---------------------------------------------------------------------------
// Placeholder chips
// ---------------------------------------------------------------------------
const PLACEHOLDERS: Record<string, { label: string; value: string }[]> = {
  welcome: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "appUrl",    value: "{{appUrl}}" },
  ],
  signup: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "otpCode",   value: "{{otpCode}}" },
  ],
  reset: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "resetLink", value: "{{resetLink}}" },
  ],
  deleted: [
    { label: "appName",     value: "{{appName}}" },
    { label: "userEmail",   value: "{{userEmail}}" },
    { label: "userName",    value: "{{userName}}" },
    { label: "deletedDate", value: "{{deletedDate}}" },
  ],
  waitinglist: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "appUrl",    value: "{{appUrl}}" },
  ],
};

const TEMPLATES = [
  {
    id: "welcome",
    label: "Welcome email",
    prefix: "email_welcome",
    defaultSubject: "Benvenuto in {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nBenvenuto in {{appName}}! Il tuo account è stato creato con successo.\n\nPuoi accedere alla piattaforma da: {{appUrl}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "signup",
    label: "Signup verification",
    prefix: "email_signup",
    defaultSubject: "Verifica la tua email — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nUsa il codice qui sotto per verificare il tuo account.\nIl codice è valido per 15 minuti.\n\nCodice: {{otpCode}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "reset",
    label: "Password Reset",
    prefix: "email_reset",
    defaultSubject: "Reimposta la tua password — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nHai richiesto di reimpostare la password del tuo account.\nClicca il link qui sotto per procedere. Il link è valido per 30 minuti.\n\n{{resetLink}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "deleted",
    label: "User deleted",
    prefix: "email_deleted",
    defaultSubject: "Il tuo account è stato eliminato — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nIl tuo account {{appName}} è stato eliminato definitivamente in data {{deletedDate}} da un amministratore.\n\nI tuoi dati personali sono stati rimossi dai sistemi attivi.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "waitinglist",
    label: "Waiting list (landing coming-soon)",
    prefix: "email_waitinglist",
    defaultSubject: "Sei nella waiting list di {{appName}}",
    defaultBody:
      "Ciao,\n\nGrazie per esserti iscritto alla waiting list di {{appName}}.\n\nSei tra i primi a sapere quando apriremo le porte: ti scriveremo non appena saremo pronti.\n\nA presto.",
    defaultFooter: "© {{appName}}",
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

// ---------------------------------------------------------------------------
// Chip placeholder
// ---------------------------------------------------------------------------
function PlaceholderChip({
  label,
  value,
  onInsert,
}: {
  label: string;
  value: string;
  onInsert: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onInsert(value)}
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors"
      style={{
        background: "var(--admin-accent)" + "18",
        color: "var(--admin-accent)",
        border: "1px solid " + "var(--admin-accent)" + "30",
      }}
      title={`Inserisci ${value}`}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single Template Accordion Panel
// ---------------------------------------------------------------------------
function TemplatePanel({
  template,
  settings,
}: {
  template: (typeof TEMPLATES)[number];
  settings: AppSettings;
}) {
  const [open, setOpen] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);

  const s = settings as Record<string, string | null>;
  const currentSubject = s[`${template.prefix}_subject`] ?? "";
  const currentBcc = s[`${template.prefix}_bcc`] ?? "";
  const currentBody = s[`${template.prefix}_body`] ?? "";
  const currentFooter = s[`${template.prefix}_footer`] ?? "";

  function insertPlaceholder(
    ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
    value: string,
  ) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.slice(0, start) + value + el.value.slice(end);
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el.nodeName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeSetter?.call(el, newVal);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    el.setSelectionRange(start + value.length, start + value.length);
  }

  // Le input usano --admin-input-bg (#fff in light, scuro in dark)
  // che contrasta con --admin-page-bg (#f1f5f9) usato come sfondo sezione aperta
  const inputStyle = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };

  const chips = PLACEHOLDERS[template.id] ?? [];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--admin-card-border)" }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
        style={{ background: "var(--admin-card-bg)", color: "var(--admin-text)" }}>
        <span className="text-sm font-semibold">{template.label}</span>
        <div className="flex items-center gap-2">
          {(currentSubject || currentBody) && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "var(--admin-accent)" + "18",
                color: "var(--admin-accent)",
              }}>
              Personalizzata
            </span>
          )}
          <ChevronDown
            size={15}
            className="transition-transform"
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              color: "var(--admin-text-muted)",
            }}
          />
        </div>
      </button>

      {/* Body — sfondo --admin-page-bg così le input bianche spiccano */}
      {open && (
        <div
          className="px-5 py-5 space-y-5"
          style={{
            background: "var(--admin-page-bg)",
            borderTop: "1px solid var(--admin-card-border)",
          }}>
          {/* Placeholder chips */}
          <div>
            <p
              className="text-[11px] font-medium mb-2"
              style={{ color: "var(--admin-text-muted)" }}>
              Placeholder disponibili — clicca per inserire nel campo attivo:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <PlaceholderChip
                  key={chip.value}
                  label={chip.label}
                  value={chip.value}
                  onInsert={(v) => {
                    const active = document.activeElement;
                    if (active === subjectRef.current)
                      insertPlaceholder(subjectRef as React.RefObject<HTMLInputElement>, v);
                    else if (active === bccRef.current)
                      insertPlaceholder(bccRef as React.RefObject<HTMLInputElement>, v);
                    else if (active === footerRef.current)
                      insertPlaceholder(footerRef as React.RefObject<HTMLTextAreaElement>, v);
                    else
                      insertPlaceholder(bodyRef as React.RefObject<HTMLTextAreaElement>, v);
                  }}
                />
              ))}
            </div>
          </div>

          {/* Oggetto */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              Oggetto email
            </label>
            <input
              ref={subjectRef}
              name={`${template.prefix}_subject`}
              defaultValue={currentSubject}
              placeholder={template.defaultSubject}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
              Se vuoto, viene usato il testo predefinito.
            </p>
          </div>

          {/* BCC */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              BCC (opzionale)
            </label>
            <input
              ref={bccRef}
              name={`${template.prefix}_bcc`}
              type="email"
              defaultValue={currentBcc}
              placeholder="copia@tuodominio.com"
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            />
          </div>

          {/* Corpo */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              Corpo email
            </label>
            <textarea
              ref={bodyRef}
              name={`${template.prefix}_body`}
              rows={6}
              defaultValue={currentBody}
              placeholder={template.defaultBody}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors resize-y font-mono"
              style={{ ...inputStyle, lineHeight: "1.6" }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
              Solo testo — l'HTML della email è gestito automaticamente. Usa i placeholder sopra.
            </p>
          </div>

          {/* Footer */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              Footer
            </label>
            <textarea
              ref={footerRef}
              name={`${template.prefix}_footer`}
              rows={2}
              defaultValue={currentFooter}
              placeholder={template.defaultFooter}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors resize-y"
              style={{ ...inputStyle, lineHeight: "1.6" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function EmailTemplatesTab({ settings }: { settings: AppSettings }) {
  const pathname = usePathname();
  return <EmailTemplatesTabInner key={pathname} settings={settings} />;
}

function EmailTemplatesTabInner({ settings }: { settings: AppSettings }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveEmailTemplateSettings,
    {},
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state && state.success)
      setToast({ message: state.success, type: "success" });
    if ("error" in state && state.error)
      setToast({ message: state.error, type: "error" });
  }, [state]);

  return (
    <>
      <form action={formAction} className="space-y-3">
        {TEMPLATES.map((tpl) => (
          <TemplatePanel key={tpl.id} template={tpl} settings={settings} />
        ))}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) =>
              !isPending &&
              (e.currentTarget.style.background = "var(--admin-accent-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--admin-accent)")
            }>
            {isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {isPending ? "Salvataggio..." : "Salva tutti i template"}
          </button>
        </div>
      </form>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
