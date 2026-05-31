// app/(admin)/admin/settings/tabs/email-templates-tab.tsx
"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type { AppSettings } from "@/lib/db/settings-queries";
import type { Locale } from "@/lib/i18n/config";
import {
  ChevronDown,
  FileCode2,
  ImageIcon,
  Loader2,
  Save,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
  modstrike: [
    { label: "appName",       value: "{{appName}}" },
    { label: "userEmail",     value: "{{userEmail}}" },
    { label: "userName",      value: "{{userName}}" },
    { label: "strikeNumber",  value: "{{strikeNumber}}" },
    { label: "reason",        value: "{{reason}}" },
    { label: "sourceType",    value: "{{sourceType}}" },
    { label: "sourcePreview", value: "{{sourcePreview}}" },
    { label: "appUrl",        value: "{{appUrl}}" },
  ],
  modbanned: [
    { label: "appName",       value: "{{appName}}" },
    { label: "userEmail",     value: "{{userEmail}}" },
    { label: "userName",      value: "{{userName}}" },
    { label: "reason",        value: "{{reason}}" },
    { label: "sourceType",    value: "{{sourceType}}" },
    { label: "sourcePreview", value: "{{sourcePreview}}" },
    { label: "appUrl",        value: "{{appUrl}}" },
  ],
  modstrikerevoked: [
    { label: "appName",          value: "{{appName}}" },
    { label: "userEmail",        value: "{{userEmail}}" },
    { label: "userName",         value: "{{userName}}" },
    { label: "activeCountAfter", value: "{{activeCountAfter}}" },
    { label: "unbanned",         value: "{{unbanned}}" },
    { label: "appUrl",           value: "{{appUrl}}" },
  ],
  businessapproved: [
    { label: "appName",     value: "{{appName}}" },
    { label: "userEmail",   value: "{{userEmail}}" },
    { label: "userName",    value: "{{userName}}" },
    { label: "companyName", value: "{{companyName}}" },
    { label: "appUrl",      value: "{{appUrl}}" },
  ],
  businessrejected: [
    { label: "appName",     value: "{{appName}}" },
    { label: "userEmail",   value: "{{userEmail}}" },
    { label: "userName",    value: "{{userName}}" },
    { label: "companyName", value: "{{companyName}}" },
    { label: "reason",      value: "{{reason}}" },
    { label: "appUrl",      value: "{{appUrl}}" },
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
  "modstrike",
  "modbanned",
  "modstrikerevoked",
  "businessapproved",
  "businessrejected",
] as const;

type TemplateId = (typeof TEMPLATE_IDS)[number];
type LocaleField = "subject" | "body" | "footer";

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
  modstrike: "email_modstrike",
  modbanned: "email_modbanned",
  modstrikerevoked: "email_modstrikerevoked",
  businessapproved: "email_businessapproved",
  businessrejected: "email_businessrejected",
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
  modstrike: "lib/email/templates/moderation-strike-received.ts",
  modbanned: "lib/email/templates/moderation-banned.ts",
  modstrikerevoked: "lib/email/templates/moderation-strike-revoked.ts",
  businessapproved: "lib/email/templates/business-approved.ts",
  businessrejected: "lib/email/templates/business-rejected.ts",
};

// ---------------------------------------------------------------------------
// Types — props
// ---------------------------------------------------------------------------
export type EmailLocaleOption = {
  code: Locale;
  nativeLabel: string;
  isDefault: boolean;
};

type Overlays = Record<string, Record<string, string>>;
type LocaleValues = Partial<Record<LocaleField, string>>;
// Mappa: localeCode -> templateId -> { subject, body, footer }
type ValuesByLocale = Record<string, Record<TemplateId, LocaleValues>>;

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
  activeLocale,
  defaultLocaleCode,
  values,
  bccValue,
  onFieldChange,
  onBccChange,
}: {
  id: TemplateId;
  settings: AppSettings;
  activeLocale: Locale;
  defaultLocaleCode: Locale;
  values: LocaleValues;
  bccValue: string;
  onFieldChange: (field: LocaleField, value: string) => void;
  onBccChange: (value: string) => void;
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
  const isDefault = activeLocale === defaultLocaleCode;

  const subject = values.subject ?? "";
  const body = values.body ?? "";
  const footer = values.footer ?? "";

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
      el.nodeName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
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

  // Header badge: "customizzato" se ALMENO UNA locale ha subject o body.
  const settingsRecord = settings as Record<string, string | null>;
  const hasAnyContent =
    !!(settingsRecord[`${prefix}_subject`] || settingsRecord[`${prefix}_body`]);

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
          {hasAnyContent && (
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

      {/* Body */}
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
                  insertTitle={t("placeholderInsertTitle", {
                    value: chip.value,
                  })}
                  onInsert={(v) => {
                    const active = document.activeElement;
                    if (active === subjectRef.current)
                      insertPlaceholder(
                        subjectRef as React.RefObject<HTMLInputElement>,
                        v,
                      );
                    else if (active === bccRef.current)
                      insertPlaceholder(
                        bccRef as React.RefObject<HTMLInputElement>,
                        v,
                      );
                    else if (active === footerRef.current)
                      insertPlaceholder(
                        footerRef as React.RefObject<HTMLTextAreaElement>,
                        v,
                      );
                    else
                      insertPlaceholder(
                        bodyRef as React.RefObject<HTMLTextAreaElement>,
                        v,
                      );
                  }}
                />
              ))}
            </div>
          </div>

          {/* Subject (per-locale) */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("subjectLabel")}
            </label>
            <input
              ref={subjectRef}
              value={subject}
              onChange={(e) => onFieldChange("subject", e.target.value)}
              placeholder={tTpl("defaultSubject")}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={inputStyle}
            />
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("subjectHint")}
            </p>
          </div>

          {/* BCC (NON per-locale: visibile solo nella tab default per evitare
              confusione, ma il valore unico viene salvato con `${prefix}_bcc`) */}
          {isDefault && (
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("bccLabel")}
              </label>
              <input
                ref={bccRef}
                type="email"
                value={bccValue}
                onChange={(e) => onBccChange(e.target.value)}
                placeholder={t("bccPlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              />
            </div>
          )}

          {/* Body (per-locale) */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("bodyLabel")}
            </label>
            <textarea
              ref={bodyRef}
              rows={6}
              value={body}
              onChange={(e) => onFieldChange("body", e.target.value)}
              placeholder={tTpl("defaultBody")}
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors resize-y font-mono"
              style={{ ...inputStyle, lineHeight: "1.6" }}
            />
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("bodyHint")}
            </p>
          </div>

          {/* Footer (per-locale) */}
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("footerLabel")}
            </label>
            <textarea
              ref={footerRef}
              rows={2}
              value={footer}
              onChange={(e) => onFieldChange("footer", e.target.value)}
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
// Email logo selector (immutato)
// ---------------------------------------------------------------------------
function EmailLogoCard({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.settings.emailTemplates.emailLogo");
  const adminSlug = useAdminSlug();
  const generalHref = buildAdminPathFromSlug(adminSlug, getAdminRelPath("settings-general"));
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

  const missingForChoice = choice !== "none" && !previewUrl;

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
          href={generalHref}
          className="underline"
          style={{ color: "var(--admin-accent)" }}>
          {t("descLink")}
        </a>
        {t("descAfter")}
      </p>

      <div className="flex items-center gap-4">
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
// Language tab strip
// ---------------------------------------------------------------------------
function LanguageTabs({
  locales,
  active,
  onSwitch,
}: {
  locales: EmailLocaleOption[];
  active: Locale;
  onSwitch: (code: Locale) => void;
}) {
  const t = useTranslations("admin.settings.emailTemplates.languageTabs");
  if (locales.length <= 1) return null;
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl w-fit"
      style={{ background: "var(--admin-hover-bg)" }}>
      {locales.map((l) => {
        const isActive = l.code === active;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => onSwitch(l.code)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
            style={{
              background: isActive ? "var(--admin-accent)" : "transparent",
              color: isActive ? "#fff" : "var(--admin-text-muted)",
              boxShadow: isActive ? "0 1px 3px oklch(0 0 0 / 0.15)" : "none",
            }}
            aria-pressed={isActive}>
            {l.nativeLabel}
            {l.isDefault && (
              <span
                className="text-[10px] uppercase tracking-wide"
                style={{
                  opacity: 0.8,
                  fontWeight: 600,
                }}>
                · {t("defaultBadge")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function EmailTemplatesTab({
  settings,
  locales,
  overlays,
}: {
  settings: AppSettings;
  locales: EmailLocaleOption[];
  overlays: Overlays;
}) {
  const pathname = usePathname();
  return (
    <EmailTemplatesTabInner
      key={pathname}
      settings={settings}
      locales={locales}
      overlays={overlays}
    />
  );
}

function EmailTemplatesTabInner({
  settings,
  locales,
  overlays,
}: {
  settings: AppSettings;
  locales: EmailLocaleOption[];
  overlays: Overlays;
}) {
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

  const defaultLocale = locales.find((l) => l.isDefault) ?? locales[0];
  const defaultLocaleCode = defaultLocale.code;
  const [activeLocale, setActiveLocale] = useState<Locale>(defaultLocaleCode);

  // Stato controllato per ogni (locale, templateId, field). Inizializzato da
  // settings (default) e overlays (non-default).
  const initialValues = useMemo<ValuesByLocale>(() => {
    const out: ValuesByLocale = {};
    const settingsRecord = settings as Record<string, string | null>;
    for (const loc of locales) {
      const perTemplate = {} as Record<TemplateId, LocaleValues>;
      for (const id of TEMPLATE_IDS) {
        const prefix = TEMPLATE_PREFIX[id];
        if (loc.isDefault) {
          perTemplate[id] = {
            subject: settingsRecord[`${prefix}_subject`] ?? "",
            body: settingsRecord[`${prefix}_body`] ?? "",
            footer: settingsRecord[`${prefix}_footer`] ?? "",
          };
        } else {
          const map = overlays[loc.code] ?? {};
          perTemplate[id] = {
            subject: map[`${prefix}_subject`] ?? "",
            body: map[`${prefix}_body`] ?? "",
            footer: map[`${prefix}_footer`] ?? "",
          };
        }
      }
      out[loc.code] = perTemplate;
    }
    return out;
  }, [settings, locales, overlays]);

  const initialBcc = useMemo(() => {
    const settingsRecord = settings as Record<string, string | null>;
    const out = {} as Record<TemplateId, string>;
    for (const id of TEMPLATE_IDS) {
      out[id] = settingsRecord[`${TEMPLATE_PREFIX[id]}_bcc`] ?? "";
    }
    return out;
  }, [settings]);

  const [valuesByLocale, setValuesByLocale] =
    useState<ValuesByLocale>(initialValues);
  const [bccValues, setBccValues] = useState<Record<TemplateId, string>>(
    initialBcc,
  );

  function updateField(
    loc: Locale,
    id: TemplateId,
    field: LocaleField,
    value: string,
  ) {
    setValuesByLocale((prev) => ({
      ...prev,
      [loc]: {
        ...prev[loc],
        [id]: { ...prev[loc][id], [field]: value },
      },
    }));
  }

  function updateBcc(id: TemplateId, value: string) {
    setBccValues((prev) => ({ ...prev, [id]: value }));
  }

  return (
    <>
      <form action={formAction} className="space-y-3">
        {/* Hidden carrier dei valori per TUTTE le locale: l'admin vede solo la
            locale attiva, ma il save scrive ogni variante. Convenzioni nomi:
              - default: `${prefix}_subject|body|footer|bcc` (chiavi storiche)
              - non-default: `tr.<locale>.${prefix}_subject|body|footer`
            La server action sa che `tr.<locale>.*` va in `translations`. */}
        {locales.map((loc) =>
          TEMPLATE_IDS.map((id) => {
            const prefix = TEMPLATE_PREFIX[id];
            const v = valuesByLocale[loc.code][id];
            const namePrefix = loc.isDefault ? prefix : `tr.${loc.code}.${prefix}`;
            return (
              <div key={`${loc.code}-${id}`} hidden>
                <input
                  type="hidden"
                  name={`${namePrefix}_subject`}
                  value={v.subject ?? ""}
                />
                <input
                  type="hidden"
                  name={`${namePrefix}_body`}
                  value={v.body ?? ""}
                />
                <input
                  type="hidden"
                  name={`${namePrefix}_footer`}
                  value={v.footer ?? ""}
                />
              </div>
            );
          }),
        )}
        {/* BCC unico per template (default-only) */}
        {TEMPLATE_IDS.map((id) => (
          <input
            key={`bcc-${id}`}
            type="hidden"
            name={`${TEMPLATE_PREFIX[id]}_bcc`}
            value={bccValues[id]}
          />
        ))}

        <EmailLogoCard settings={settings} />

        {/* Language tabs */}
        {locales.length > 1 && (
          <div className="pt-2 pb-1">
            <LanguageTabs
              locales={locales}
              active={activeLocale}
              onSwitch={setActiveLocale}
            />
          </div>
        )}

        {TEMPLATE_IDS.map((id) => (
          <TemplatePanel
            key={`${id}-${activeLocale}`}
            id={id}
            settings={settings}
            activeLocale={activeLocale}
            defaultLocaleCode={defaultLocaleCode}
            values={valuesByLocale[activeLocale][id]}
            bccValue={bccValues[id]}
            onFieldChange={(field, value) =>
              updateField(activeLocale, id, field, value)
            }
            onBccChange={(value) => updateBcc(id, value)}
          />
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
