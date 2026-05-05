// app/(admin)/admin/settings/tabs/email-templates-tab.tsx
"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ChevronDown, FileCode2, ImageIcon, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
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

const TEMPLATE_IDS = [
  "welcome",
  "signup",
  "reset",
  "deleted",
  "waitinglist",
  "emailchange",
  "device",
  "staffinvite",
  "gdprexport",
  "accountdeletion",
  "accountdeletionotp",
  "mfaenabled",
  "mfadisabled",
  "mfaadminreset",
] as const;

type TemplateId = (typeof TEMPLATE_IDS)[number];

const TEMPLATE_PREFIX: Record<TemplateId, string> = {
  welcome: "email_welcome",
  signup: "email_signup",
  reset: "email_reset",
  deleted: "email_deleted",
  waitinglist: "email_waitinglist",
  emailchange: "email_emailchange",
  device: "email_device",
  staffinvite: "email_staffinvite",
  gdprexport: "email_gdprexport",
  accountdeletion: "email_accountdeletion",
  accountdeletionotp: "email_accountdeletionotp",
  mfaenabled: "email_mfaenabled",
  mfadisabled: "email_mfadisabled",
  mfaadminreset: "email_mfaadminreset",
};

const TEMPLATE_FILE: Record<TemplateId, string> = {
  welcome: "lib/email/templates/welcome.ts",
  signup: "lib/email/templates/signup-verification.ts",
  reset: "lib/email/templates/password-reset.ts",
  deleted: "lib/email/templates/user-deleted.ts",
  waitinglist: "lib/email/templates/waiting-list.ts",
  emailchange: "lib/email/templates/email-change-verification.ts",
  device: "lib/email/templates/device-verification.ts",
  staffinvite: "lib/email/templates/staff-invitation.ts",
  gdprexport: "lib/email/templates/gdpr-export-ready.ts",
  accountdeletion: "lib/email/templates/account-deletion-requested.ts",
  accountdeletionotp: "lib/email/templates/account-deletion-otp.ts",
  mfaenabled: "lib/email/templates/mfa-enabled.ts",
  mfadisabled: "lib/email/templates/mfa-disabled.ts",
  mfaadminreset: "lib/email/templates/mfa-admin-reset.ts",
};

// ---------------------------------------------------------------------------
// Chip placeholder
// ---------------------------------------------------------------------------
function PlaceholderChip({
  label,
  value,
  onInsert,
  insertTitle,
}: {
  label: string;
  value: string;
  onInsert: (v: string) => void;
  insertTitle: string;
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
      title={insertTitle}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single Template Accordion Panel
// ---------------------------------------------------------------------------
function TemplatePanel({
  id,
  settings,
}: {
  id: TemplateId;
  settings: AppSettings;
}) {
  const t = useTranslations("admin.settings.emailTemplates");
  const tTpl = useTranslations(`admin.settings.emailTemplates.templates.${id}`);
  const [open, setOpen] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);

  const prefix = TEMPLATE_PREFIX[id];
  const file = TEMPLATE_FILE[id];

  const s = settings as Record<string, string | null>;
  const currentSubject = s[`${prefix}_subject`] ?? "";
  const currentBcc = s[`${prefix}_bcc`] ?? "";
  const currentBody = s[`${prefix}_body`] ?? "";
  const currentFooter = s[`${prefix}_footer`] ?? "";

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

  const chips = PLACEHOLDERS[id] ?? [];

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
        <span className="text-sm font-semibold">{tTpl("label")}</span>
        <div className="flex items-center gap-2">
          {(currentSubject || currentBody) && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "var(--admin-accent)" + "18",
                color: "var(--admin-accent)",
              }}>
              {t("customizedBadge")}
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
                {t("templateFile")}
              </p>
              <code
                className="text-[12px] font-mono break-all"
                style={{ color: "var(--admin-text)" }}>
                {file}
              </code>
            </div>
          </div>

          {/* Placeholder chips */}
          <div>
            <p
              className="text-[11px] font-medium mb-2"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("placeholdersHint")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <PlaceholderChip
                  key={chip.value}
                  label={chip.label}
                  value={chip.value}
                  insertTitle={t("placeholderInsertTitle", { value: chip.value })}
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
              {t("subjectLabel")}
            </label>
            <input
              ref={subjectRef}
              name={`${prefix}_subject`}
              defaultValue={currentSubject}
              placeholder={tTpl("defaultSubject")}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
              {t("subjectHint")}
            </p>
          </div>

          {/* BCC */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("bccLabel")}
            </label>
            <input
              ref={bccRef}
              name={`${prefix}_bcc`}
              type="email"
              defaultValue={currentBcc}
              placeholder={t("bccPlaceholder")}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            />
          </div>

          {/* Body */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("bodyLabel")}
            </label>
            <textarea
              ref={bodyRef}
              name={`${prefix}_body`}
              rows={6}
              defaultValue={currentBody}
              placeholder={tTpl("defaultBody")}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors resize-y font-mono"
              style={{ ...inputStyle, lineHeight: "1.6" }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
              {t("bodyHint")}
            </p>
          </div>

          {/* Footer */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("footerLabel")}
            </label>
            <textarea
              ref={footerRef}
              name={`${prefix}_footer`}
              rows={2}
              defaultValue={currentFooter}
              placeholder={tTpl("defaultFooter")}
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
  const t = useTranslations("admin.settings.emailTemplates.emailLogo");
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
          {t("title")}
        </h3>
      </div>
      <p
        className="text-[11px] mb-4"
        style={{ color: "var(--admin-text-faint)" }}>
        {t("descBefore")}{" "}
        <a
          href="/admin/settings/general"
          className="underline"
          style={{ color: "var(--admin-accent)" }}>
          {t("descLink")}
        </a>
        {t("descAfter")}
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
              alt={t("previewAlt")}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span
              className="text-[11px] font-medium text-center"
              style={{ color: "var(--admin-text-faint)" }}>
              {choice === "none" ? t("previewTextOnly") : t("previewNotUploaded")}
            </span>
          )}
        </div>

        {/* Selector */}
        <div className="flex-1 min-w-0">
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("headerStyleLabel")}
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
            <option value="logo">{t("optionLogo")}</option>
            <option value="logo-variant">{t("optionLogoVariant")}</option>
            <option value="none">{t("optionNone")}</option>
          </select>
          {missingForChoice && (
            <p
              className="text-[11px] mt-1.5"
              style={{ color: "var(--admin-accent)" }}>
              {t("missingHint")}
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
  const t = useTranslations("admin.settings.emailTemplates");
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

        {TEMPLATE_IDS.map((id) => (
          <TemplatePanel key={id} id={id} settings={settings} />
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
            {isPending ? t("saving") : t("saveAll")}
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
