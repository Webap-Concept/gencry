// app/(admin)/admin/settings/tabs/email-templates-tab.tsx
"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ChevronDown, FileCode2, ImageIcon, Loader2, Save } from "lucide-react";
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
  emailchange: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "otpCode",   value: "{{otpCode}}" },
  ],
  device: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "otpCode",   value: "{{otpCode}}" },
  ],
  staffinvite: [
    { label: "appName",      value: "{{appName}}" },
    { label: "inviteeEmail", value: "{{inviteeEmail}}" },
    { label: "inviterName",  value: "{{inviterName}}" },
    { label: "roleLabel",    value: "{{roleLabel}}" },
    { label: "inviteUrl",    value: "{{inviteUrl}}" },
  ],
  gdprexport: [
    { label: "appName",      value: "{{appName}}" },
    { label: "userEmail",    value: "{{userEmail}}" },
    { label: "userName",     value: "{{userName}}" },
    { label: "downloadLink", value: "{{downloadLink}}" },
  ],
  accountdeletion: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "purgeDate", value: "{{purgeDate}}" },
  ],
  accountdeletionotp: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "otpCode",   value: "{{otpCode}}" },
  ],
  mfaenabled: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
  ],
  mfadisabled: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
  ],
  mfaadminreset: [
    { label: "appName",   value: "{{appName}}" },
    { label: "userEmail", value: "{{userEmail}}" },
    { label: "userName",  value: "{{userName}}" },
    { label: "reason",    value: "{{reason}}" },
  ],
};

const TEMPLATES = [
  {
    id: "welcome",
    label: "Welcome email",
    prefix: "email_welcome",
    file: "lib/email/templates/welcome.ts",
    defaultSubject: "Benvenuto in {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nBenvenuto in {{appName}}! Il tuo account è stato creato con successo.\n\nPuoi accedere alla piattaforma da: {{appUrl}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "signup",
    label: "Signup verification",
    prefix: "email_signup",
    file: "lib/email/templates/signup-verification.ts",
    defaultSubject: "Verifica la tua email — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nUsa il codice qui sotto per verificare il tuo account.\nIl codice è valido per 15 minuti.\n\nCodice: {{otpCode}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "reset",
    label: "Password Reset",
    prefix: "email_reset",
    file: "lib/email/templates/password-reset.ts",
    defaultSubject: "Reimposta la tua password — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nHai richiesto di reimpostare la password del tuo account.\nClicca il link qui sotto per procedere. Il link è valido per 30 minuti.\n\n{{resetLink}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "deleted",
    label: "User deleted",
    prefix: "email_deleted",
    file: "lib/email/templates/user-deleted.ts",
    defaultSubject: "Il tuo account è stato eliminato — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nIl tuo account {{appName}} è stato eliminato definitivamente in data {{deletedDate}} da un amministratore.\n\nI tuoi dati personali sono stati rimossi dai sistemi attivi.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "waitinglist",
    label: "Waiting list (landing coming-soon)",
    prefix: "email_waitinglist",
    file: "lib/email/templates/waiting-list.ts",
    defaultSubject: "Sei nella waiting list di {{appName}}",
    defaultBody:
      "Ciao,\n\nGrazie per esserti iscritto alla waiting list di {{appName}}.\n\nSei tra i primi a sapere quando apriremo le porte: ti scriveremo non appena saremo pronti.\n\nA presto.",
    defaultFooter: "© {{appName}}",
  },
  {
    id: "emailchange",
    label: "Email change verification",
    prefix: "email_emailchange",
    file: "lib/email/templates/email-change-verification.ts",
    defaultSubject:
      "{{otpCode}} è il tuo codice per confermare la nuova email {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nHai richiesto di cambiare l'email del tuo account {{appName}} con questo indirizzo. Inserisci il codice qui sotto per confermare il cambio. Se non sei stato tu, ignora questa email — il cambio non verrà applicato.\n\nCodice: {{otpCode}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "device",
    label: "Device verification (login da nuovo dispositivo)",
    prefix: "email_device",
    file: "lib/email/templates/device-verification.ts",
    defaultSubject: "{{otpCode}} è il tuo codice di accesso da nuovo dispositivo",
    defaultBody:
      "Ciao {{userName}},\n\nAbbiamo rilevato un accesso al tuo account su {{appName}} da un dispositivo non riconosciuto. Inserisci il codice qui sotto per confermare che sei tu.\n\nCodice: {{otpCode}}",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "staffinvite",
    label: "Staff invitation",
    prefix: "email_staffinvite",
    file: "lib/email/templates/staff-invitation.ts",
    defaultSubject: "Invito Staff — {{appName}}",
    defaultBody:
      "Ciao,\n\n{{inviterName}} ti ha invitato a entrare nel team staff di {{appName}} con il ruolo di {{roleLabel}}.\n\nClicca il pulsante qui sotto per accettare o rifiutare l'invito. Il link è valido per 48 ore.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "gdprexport",
    label: "GDPR export ready",
    prefix: "email_gdprexport",
    file: "lib/email/templates/gdpr-export-ready.ts",
    defaultSubject: "I tuoi dati sono pronti — {{appName}}",
    defaultBody:
      "Abbiamo preparato l'archivio dei tuoi dati personali su {{appName}}, come da tua richiesta.\nPuoi scaricarlo dal pulsante qui sotto. Il link è valido per 24 ore; se scade, puoi rigenerarlo dalle impostazioni privacy del tuo account.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "accountdeletion",
    label: "Account deletion requested",
    prefix: "email_accountdeletion",
    file: "lib/email/templates/account-deletion-requested.ts",
    defaultSubject: "Conferma richiesta di eliminazione account — {{appName}}",
    defaultBody:
      "Abbiamo ricevuto la tua richiesta di eliminazione dell'account su {{appName}}. I tuoi dati personali saranno cancellati definitivamente il {{purgeDate}}.\nFino a quel momento puoi annullare la richiesta scrivendo all'assistenza. Dopo il purge non sarà più possibile recuperare i dati.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "accountdeletionotp",
    label: "Account deletion OTP (OAuth-only)",
    prefix: "email_accountdeletionotp",
    file: "lib/email/templates/account-deletion-otp.ts",
    defaultSubject: "{{otpCode}} è il tuo codice per eliminare l'account {{appName}}",
    defaultBody:
      "Hai chiesto di eliminare il tuo account {{appName}}. Inserisci il codice qui sotto per confermare. Se non sei stato tu, ignora questa email — il codice scade tra 15 minuti.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "mfaenabled",
    label: "MFA enabled (verifica a due fattori attivata)",
    prefix: "email_mfaenabled",
    file: "lib/email/templates/mfa-enabled.ts",
    defaultSubject: "Autenticazione a due fattori attivata — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nHai appena attivato l'autenticazione a due fattori sul tuo account {{appName}}. Da ora in poi al login ti chiederemo un codice generato dalla tua app autenticatore oltre alla password.\n\nConserva i recovery codes in un posto sicuro: sono l'unico modo per accedere se perdi il telefono.\n\nSe non sei stato tu, accedi al tuo account, disabilita la verifica e contatta subito l'assistenza.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "mfadisabled",
    label: "MFA disabled (verifica a due fattori disattivata)",
    prefix: "email_mfadisabled",
    file: "lib/email/templates/mfa-disabled.ts",
    defaultSubject: "Autenticazione a due fattori disattivata — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nHai appena disattivato l'autenticazione a due fattori sul tuo account {{appName}}. Al prossimo login useremo solo email e password — il livello di protezione del tuo account è diminuito.\n\nTutti i recovery codes che avevi sono stati invalidati. Se vuoi puoi riattivare la verifica a due fattori in qualsiasi momento dalle impostazioni di sicurezza.\n\nSe non sei stato tu, cambia subito la password e contatta l'assistenza.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
  },
  {
    id: "mfaadminreset",
    label: "MFA reset by admin (supporto ha resettato il TOTP utente)",
    prefix: "email_mfaadminreset",
    file: "lib/email/templates/mfa-admin-reset.ts",
    defaultSubject: "Verifica a due fattori resettata dal supporto — {{appName}}",
    defaultBody:
      "Ciao {{userName}},\n\nUn amministratore di {{appName}} ha resettato la verifica a due fattori sul tuo account. Tutti i recovery codes precedenti sono stati invalidati e al prossimo login useremo solo email e password.\n\nMotivazione del supporto: {{reason}}\n\nPer ripristinare la protezione, accedi al tuo account e riattiva la verifica a due fattori dalle impostazioni di sicurezza. Se non hai richiesto questa operazione, contatta subito l'assistenza e cambia la password.",
    defaultFooter: "© {{appName}} · Tutti i diritti riservati",
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
      title={`Insert ${value}`}>
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
              Customized
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
          {/* Template file location */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <FileCode2
              size={13}
              style={{ color: "var(--admin-text-muted)" }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: "var(--admin-text-faint)" }}>
                Template file
              </p>
              <code
                className="text-[12px] font-mono break-all"
                style={{ color: "var(--admin-text)" }}>
                {template.file}
              </code>
            </div>
          </div>

          {/* Placeholder chips */}
          <div>
            <p
              className="text-[11px] font-medium mb-2"
              style={{ color: "var(--admin-text-muted)" }}>
              Available placeholders — click to insert into the active field:
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

          {/* Subject */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              Email subject
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
              If empty, the default text is used.
            </p>
          </div>

          {/* BCC */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              BCC (optional)
            </label>
            <input
              ref={bccRef}
              name={`${template.prefix}_bcc`}
              type="email"
              defaultValue={currentBcc}
              placeholder="copy@yourdomain.com"
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            />
          </div>

          {/* Body */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              Email body
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
              Plain text only — the email HTML is handled automatically. Use the placeholders above.
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
// Email logo selector
// ---------------------------------------------------------------------------
function EmailLogoCard({ settings }: { settings: AppSettings }) {
  const initial =
    settings.email_logo_choice === "logo-variant" ||
    settings.email_logo_choice === "none"
      ? settings.email_logo_choice
      : "logo";
  const [choice, setChoice] = useState<"logo" | "logo-variant" | "none">(
    initial as "logo" | "logo-variant" | "none",
  );

  const previewUrl =
    choice === "none"
      ? null
      : choice === "logo-variant"
        ? (settings.app_logo_variant_url ?? settings.app_logo_url)
        : settings.app_logo_url;

  const missingForChoice =
    choice !== "none" && !previewUrl;

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon size={14} style={{ color: "var(--admin-text)" }} />
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          Email logo
        </h3>
      </div>
      <p
        className="text-[11px] mb-4"
        style={{ color: "var(--admin-text-faint)" }}>
        Choose which brand asset appears in the header of every transactional
        email. Manage the assets in{" "}
        <a
          href="/admin/settings/general"
          className="underline"
          style={{ color: "var(--admin-accent)" }}>
          General settings
        </a>
        .
      </p>

      <div className="flex items-center gap-4">
        {/* Preview */}
        <div
          className="w-24 h-24 rounded-lg flex items-center justify-center shrink-0 overflow-hidden p-2"
          style={{
            background: previewUrl
              ? "repeating-conic-gradient(var(--admin-card-bg) 0% 25%, var(--admin-page-bg) 0% 50%) 50% / 16px 16px"
              : "var(--admin-page-bg)",
            border: "1px solid var(--admin-input-border)",
          }}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Email logo preview"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span
              className="text-[11px] font-medium text-center"
              style={{ color: "var(--admin-text-faint)" }}>
              {choice === "none" ? "Text only" : "Not uploaded"}
            </span>
          )}
        </div>

        {/* Selector */}
        <div className="flex-1 min-w-0">
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            Header style
          </label>
          <select
            name="email_logo_choice"
            value={choice}
            onChange={(e) =>
              setChoice(e.target.value as "logo" | "logo-variant" | "none")
            }
            className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={{
              background: "var(--admin-input-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}>
            <option value="logo">Logo</option>
            <option value="logo-variant">Logo variant</option>
            <option value="none">No image — show app name as text</option>
          </select>
          {missingForChoice && (
            <p
              className="text-[11px] mt-1.5"
              style={{ color: "var(--admin-accent)" }}>
              No file uploaded for this slot yet — emails will fall back to the
              app name until you upload one.
            </p>
          )}
        </div>
      </div>
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
        <EmailLogoCard settings={settings} />

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
            {isPending ? "Saving..." : "Save all templates"}
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
