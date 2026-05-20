"use client";

import { SeoFields, type JsonLdType, type RobotsValue } from "@/app/(admin)/admin/seo/_components/seo-form";
import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type {
  AppLocale,
  Page,
  PageTemplate,
  PageTranslation,
  SeoPage,
  SeoPageTranslation,
  TemplateField,
} from "@/lib/db/schema";
import type {
  ExtensionFieldOption,
  PageTemplateExtension,
} from "@/lib/cms/page-template-extensions";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockquoteStyled } from "./blockquote-styled";
import { FigureImage } from "./figure-image-node";
import {
  BlockquoteMenu,
  HeadingMenu,
  InternalLinkPicker,
  LinkDialog,
  LinkMenu,
  type InternalLinkPage,
  type LinkDialogValue,
} from "./editor-toolbar-menus";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Calendar,
  Code,
  Code2,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Lock,
  Minus,
  RotateCcw,
  RotateCw,
  Search,
  ShieldCheck,
  UnderlineIcon,
} from "lucide-react";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Fragment } from "react";
import { MediaPicker } from "../../media/_components/media-picker";
import { MediaPickerField } from "../../media/_components/media-picker-field";
import { EditorPageHeader } from "../../../_components/editor-page-header";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import { upsertPageAction } from "../actions";
import PlaceholderHint from "./placeholder-hint";

type TemplateWithFields = PageTemplate & { fields: TemplateField[] };

const FORM_ID = "page-editor-form";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}
function leafSlug(slug: string): string {
  const parts = slug.split("/");
  return parts[parts.length - 1] ?? slug;
}
function buildFullSlug(prefix: string, leaf: string): string {
  return prefix ? `${prefix}${leaf}` : leaf;
}

const inputStyle: React.CSSProperties = {
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  width: "100%",
  outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--admin-text-muted)",
  display: "block",
  marginBottom: "0.375rem",
};
const hintStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--admin-text-faint)",
  marginTop: "0.25rem",
};

function TBtn({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="p-1.5 rounded transition-colors disabled:opacity-30"
      style={{
        color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
        background: active
          ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
          : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--admin-hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}>
      {children}
    </button>
  );
}
function TDivider() {
  return (
    <div
      className="w-px h-5 mx-0.5 shrink-0"
      style={{ background: "var(--admin-divider)" }}
    />
  );
}
function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors relative"
      style={{
        color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
      }}>
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
          style={{ background: "var(--admin-accent)" }}
        />
      )}
    </button>
  );
}

/**
 * Normalizza un TemplateField del DB e/o un ExtensionField runtime nella
 * stessa shape per il render. Usata per fondere i due elenchi (template
 * DB + extension del modulo registrato sul pageType) in un unico array
 * ordinato per sortOrder.
 */
interface UnifiedField {
  key: string;
  type: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  defaultValue: string | null;
  options: ExtensionFieldOption[] | null;
  sortOrder: number;
  /** "db" = riga template_fields del DB; "module" = aggiunta runtime
   *  dal modulo via PageTemplateExtension. Usato solo per debug/docs. */
  source: "db" | "module";
}

function CustomFieldsBlock({
  template,
  customFields,
  setCustomFields,
  moduleExtension,
}: {
  template: TemplateWithFields;
  customFields: Record<string, string>;
  setCustomFields: (v: Record<string, string>) => void;
  moduleExtension: PageTemplateExtension | null;
}) {
  const t = useTranslations("admin.content.pages.editor");
  const dbFields: UnifiedField[] = template.fields.map((f) => ({
    key: f.fieldKey,
    type: f.fieldType,
    label: f.label,
    placeholder: f.placeholder,
    required: f.required,
    defaultValue: f.defaultValue,
    options: null,
    sortOrder: f.sortOrder,
    source: "db",
  }));
  const extensionFields: UnifiedField[] = (moduleExtension?.fields ?? []).map((f) => ({
    key: f.key,
    type: f.type,
    label: f.label,
    placeholder: f.placeholder ?? null,
    required: f.required ?? false,
    defaultValue: f.defaultValue ?? null,
    options: f.options ?? null,
    sortOrder: f.sortOrder ?? 999,
    source: "module",
  }));
  const allFields = [...dbFields, ...extensionFields].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  if (allFields.length === 0) return null;
  function handleField(key: string, value: string) {
    setCustomFields({ ...customFields, [key]: value });
  }
  return (
    <div
      className="rounded-xl p-4 mb-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <p
        className="text-xs font-semibold uppercase tracking-wide mb-4"
        style={{ color: "var(--admin-text-faint)" }}>
        {t("customFieldsHeading", { name: template.name })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {allFields.map((field) => (
            <div
              key={`${field.source}-${field.key}`}
              className={
                field.type === "textarea" || field.type === "richtext"
                  ? "sm:col-span-2"
                  : ""
              }>
              <label style={labelStyle}>
                {field.label}
                {field.required && <span style={{ color: "#ef4444" }}> *</span>}
              </label>
              {field.type === "textarea" || field.type === "richtext" ? (
                <textarea
                  value={customFields[field.key] ?? field.defaultValue ?? ""}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  placeholder={field.placeholder ?? ""}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              ) : field.type === "image" ? (
                <MediaPickerField
                  imageOnly
                  value={customFields[field.key] ?? field.defaultValue ?? ""}
                  onChange={(v) => handleField(field.key, v)}
                  placeholder={field.placeholder ?? undefined}
                />
              ) : field.type === "toggle" ? (
                <div className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    id={`cf-${field.key}`}
                    checked={
                      (customFields[field.key] ?? field.defaultValue) === "true"
                    }
                    onChange={(e) =>
                      handleField(field.key, e.target.checked ? "true" : "false")
                    }
                    className="w-4 h-4 rounded"
                  />
                  <label
                    htmlFor={`cf-${field.key}`}
                    className="text-sm"
                    style={{ color: "var(--admin-text)" }}>
                    {field.label}
                  </label>
                </div>
              ) : field.type === "select" ? (
                <select
                  value={customFields[field.key] ?? field.defaultValue ?? ""}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— seleziona —</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    field.type === "date"
                      ? "date"
                      : field.type === "number"
                        ? "number"
                        : "text"
                  }
                  value={customFields[field.key] ?? field.defaultValue ?? ""}
                  onChange={(e) => handleField(field.key, e.target.value)}
                  placeholder={field.placeholder ?? ""}
                  style={inputStyle}
                />
              )}
              {field.placeholder && field.type !== "toggle" && (
                <p style={hintStyle}>{field.placeholder}</p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// Il vecchio `SeoTab` (read-only summary + modal "Edit") è stato rimosso.
// Ora il tab SEO mostra direttamente i campi editabili inline tramite
// `SeoFields` (vedi seo-form.tsx) — il save avviene insieme alla pagina,
// con un solo bottone Save nell'header dell'editor.

function PubTab({
  status,
  setStatus,
  publishedAt,
  setPublishedAt,
  expiresAt,
  setExpiresAt,
  slug,
  visibility,
  setVisibility,
}: {
  status: "draft" | "published";
  setStatus: (v: "draft" | "published") => void;
  publishedAt: string;
  setPublishedAt: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  slug: string;
  visibility: "public" | "private";
  setVisibility: (v: "public" | "private") => void;
}) {
  const t = useTranslations("admin.content.pages.editor");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  return (
    <div className="space-y-5">
      <div
        className="rounded-xl px-4 py-4 space-y-3"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
        }}>
        <p style={labelStyle}>{t("pubVisibilityLabel")}</p>
        <div className="flex gap-3">
          {(["public", "private"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background:
                  visibility === v
                    ? "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
                    : "var(--admin-card-bg)",
                color:
                  visibility === v
                    ? "var(--admin-accent)"
                    : "var(--admin-text-muted)",
                border:
                  visibility === v
                    ? "1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)"
                    : "1px solid var(--admin-card-border)",
              }}>
              {v === "public"
                ? t("pubVisibilityPublic")
                : t("pubVisibilityPrivate")}
            </button>
          ))}
        </div>
        <p style={hintStyle}>
          {visibility === "public"
            ? t("pubVisibilityHintPublic")
            : t("pubVisibilityHintPrivate")}
        </p>
      </div>
      <div
        className="rounded-xl px-4 py-4 space-y-3"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
        }}>
        <p style={labelStyle}>{t("pubStatusLabel")}</p>
        <div className="flex gap-3">
          {(["draft", "published"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background:
                  status === s
                    ? s === "published"
                      ? "color-mix(in srgb, #22c55e 15%, var(--admin-card-bg))"
                      : "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))"
                    : "var(--admin-card-bg)",
                color:
                  status === s
                    ? s === "published"
                      ? "#22c55e"
                      : "var(--admin-accent)"
                    : "var(--admin-text-muted)",
                border:
                  status === s
                    ? s === "published"
                      ? "1px solid color-mix(in srgb, #22c55e 30%, transparent)"
                      : "1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)"
                    : "1px solid var(--admin-card-border)",
              }}>
              {s === "published" ? <Eye size={15} /> : <EyeOff size={15} />}
              {s === "published"
                ? t("pubStatusPublished")
                : t("pubStatusDraft")}
            </button>
          ))}
        </div>
        <p style={hintStyle}>
          {status === "published"
            ? t("pubStatusHintPublished", { slug })
            : t("pubStatusHintDraft")}
        </p>
      </div>
      <div className="space-y-1.5">
        <label style={labelStyle}>{t("pubPublishedAtLabel")}</label>
        <input
          type="datetime-local"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
          style={inputStyle}
        />
        <p style={hintStyle}>{t("pubPublishedAtHint")}</p>
      </div>
      <div className="space-y-1.5">
        <label style={labelStyle}>{t("pubExpiresAtLabel")}</label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          style={inputStyle}
        />
        <p style={hintStyle}>{t("pubExpiresAtHint")}</p>
      </div>
      {expiresAt && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5"
          style={{
            background: "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
          }}>
          <Calendar
            size={13}
            className="mt-0.5 shrink-0"
            style={{ color: "#f59e0b" }}
          />
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("pubExpiryWarningBefore")}{" "}
            <strong>{new Date(expiresAt).toLocaleString(dateLocale)}</strong>
            {t("pubExpiryWarningSuffix")}
          </p>
        </div>
      )}
    </div>
  );
}

function StrutturaTab({
  pages,
  templates,
  parentId,
  onParentChange,
  templateId,
  setTemplateId,
  setCustomFields,
  currentPageId,
  templateLocked,
  canManageTemplates,
}: {
  pages: Page[];
  templates: TemplateWithFields[];
  parentId: number | null;
  onParentChange: (v: number | null) => void;
  templateId: number | null;
  setTemplateId: (v: number | null) => void;
  setCustomFields: (v: Record<string, string>) => void;
  currentPageId?: number;
  templateLocked?: boolean;
  /** Senza content:templates il selettore è in sola lettura — il template
   *  esistente si vede ma non si può cambiare. La server action ignora
   *  comunque qualunque templateId passato senza permesso. */
  canManageTemplates: boolean;
}) {
  const t = useTranslations("admin.content.pages.editor");
  const adminSlug = useAdminSlug();
  const selectedTemplate =
    templates.find((tpl) => tpl.id === templateId) ?? null;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label style={labelStyle}>{t("structureParentLabel")}</label>
        <select
          value={parentId ?? ""}
          onChange={(e) =>
            onParentChange(e.target.value ? Number(e.target.value) : null)
          }
          style={inputStyle}>
          <option value="">{t("structureParentNone")}</option>
          {pages
            .filter(
              (p) =>
                // Le system pages non possono essere parent di una user
                // CMS page: non sono navigabili come URL CMS (sono
                // container amministrativi) e mescolare le gerarchie
                // creerebbe slug come `/sign-in/qualcosa` che non
                // verrebbero mai serviti dal CMS.
                !p.isSystem &&
                (!currentPageId || p.id !== currentPageId),
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} (/{p.slug})
              </option>
            ))}
        </select>
        <p style={hintStyle}>{t("structureParentHint")}</p>
      </div>

      <div className="space-y-1.5">
        <label style={labelStyle}>{t("structureTemplateLabel")}</label>
        {!canManageTemplates ? (
          // Read-only: l'utente non ha content:templates. Mostra il
          // template assegnato (o stato "nessuno") senza selettore.
          // La server action sovrascrive comunque qualunque templateId
          // arrivasse dal form a null/valore esistente.
          selectedTemplate ? (
            <div
              className="rounded-lg px-4 py-3 flex items-center gap-3"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
              }}>
              <Lock
                size={14}
                style={{ color: "var(--admin-text-faint)", flexShrink: 0 }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--admin-text)" }}>
                  {selectedTemplate.name}
                </p>
                <p
                  className="text-xs font-mono"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {selectedTemplate.slug}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text-faint)",
              }}>
              {t("structureTemplateNone")}
            </div>
          )
        ) : templateLocked && selectedTemplate ? (
          <div
            className="rounded-lg px-4 py-3 flex items-center gap-3"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-page-bg))",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)",
            }}>
            <ShieldCheck
              size={16}
              style={{ color: "var(--admin-accent)", flexShrink: 0 }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--admin-text)" }}>
                {selectedTemplate.name}
              </p>
              <p
                className="text-xs font-mono"
                style={{ color: "var(--admin-text-faint)" }}>
                {selectedTemplate.slug}
              </p>
            </div>
            <Lock
              size={13}
              style={{ color: "var(--admin-text-faint)", flexShrink: 0 }}
            />
          </div>
        ) : templateLocked && !selectedTemplate ? (
          <select
            value={templateId ?? ""}
            onChange={(e) => {
              setTemplateId(e.target.value ? Number(e.target.value) : null);
              setCustomFields({});
            }}
            style={inputStyle}>
            <option value="">{t("structureTemplateNoneLocked")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        ) : templates.length === 0 ? (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text-faint)",
            }}>
            {t("structureNoTemplatesBefore")}{" "}
            <a
              href={buildAdminPathFromSlug(adminSlug, getAdminRelPath("content-templates"))}
              className="underline"
              style={{ color: "var(--admin-accent)" }}>
              {t("structureNoTemplatesLink")}
            </a>{" "}
            {t("structureNoTemplatesAfter")}
          </div>
        ) : (
          <>
            <select
              value={templateId ?? ""}
              onChange={(e) => {
                const newId = e.target.value ? Number(e.target.value) : null;
                setTemplateId(newId);
                setCustomFields({});
              }}
              style={inputStyle}>
              <option value="">{t("structureTemplateNone")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p style={hintStyle}>
                {selectedTemplate.fields.length > 0
                  ? t.rich("structureTemplateHasFields", {
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })
                  : t("structureTemplateNoFields")}
              </p>
            )}
          </>
        )}
        {templateLocked && selectedTemplate && (
          <p
            style={{
              ...hintStyle,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}>
            <Lock size={11} />
            {t("structureTemplateLockedHint")}
          </p>
        )}
      </div>
    </div>
  );
}

/** Normalizza il dominio: aggiunge https:// se mancante e rimuove lo slash finale */
function buildPreviewUrl(domain: string, slug: string): string | null {
  if (!domain || !slug) return null;
  let base = domain.trim();
  if (!base.startsWith("http")) base = `https://${base}`;
  base = base.replace(/\/+$/, "");
  return `${base}/${slug}`;
}

export default function PageEditor({
  page,
  seo,
  pages = [],
  templates = [],
  domain = "",
  appName = "",
  initialParentId = null,
  initialTemplateId = null,
  templateLocked = false,
  isSystem = false,
  pageType = "page",
  contentEditable = true,
  slugEditable = true,
  locales = [],
  initialTranslations = [],
  initialSeoTranslations = [],
  canManageTemplates = false,
  moduleExtensions = [],
}: {
  page?: Page | null;
  seo?: SeoPage | null;
  pages?: Page[];
  templates?: TemplateWithFields[];
  domain?: string;
  appName?: string;
  initialParentId?: number | null;
  initialTemplateId?: number | null;
  templateLocked?: boolean;
  isSystem?: boolean;
  pageType?: string;
  contentEditable?: boolean;
  slugEditable?: boolean;
  locales?: AppLocale[];
  initialTranslations?: PageTranslation[];
  initialSeoTranslations?: SeoPageTranslation[];
  /** True se l'utente ha content:templates. Se false, il selettore
   *  template è read-only e la server action ignorerà qualunque
   *  templateId nel form. Default false = "negato by default". */
  canManageTemplates?: boolean;
  /** Extension registrate dai moduli (via `registerPageTemplateExtension`).
   *  Il page-editor pesca la giusta extension via `templateSlug` quando
   *  l'admin sceglie il template — così funziona sia nella /new (dove
   *  pageType è ancora vuoto al mount) che nell'edit. Vedi
   *  `lib/cms/page-template-extensions.ts`. */
  moduleExtensions?: PageTemplateExtension[];
}) {
  const t = useTranslations("admin.content.pages.editor");
  const router = useRouter();
  const adminSlug = useAdminSlug();
  const isEdit = !!page;
  const originalSlug = page?.slug ?? "";
  // Le system pages "meta-only" (contentEditable=false) hanno un editor
  // ridotto: niente tab Contenuto/Struttura/Pubblicazione, solo SEO.
  // L'admin gestisce esclusivamente titolo (in alto, fuori dai tab) e
  // meta SEO. Default tab = "seo" per non aprire un tab nascosto.
  const isMetaOnly = isSystem && contentEditable === false;
  const [activeTab, setActiveTab] = useState<
    "content" | "seo" | "pub" | "struttura"
  >(isMetaOnly ? "seo" : "content");

  // ── Language tabs (ProcessWire style) ──────────────────────────────────────
  const nonDefaultLocales = locales.filter((l) => l.code !== DEFAULT_LOCALE);
  const isMultilocale = nonDefaultLocales.length > 0;
  const [activeLang, setActiveLang] = useState<string>(DEFAULT_LOCALE);
  const activeLangRef = useRef<string>(DEFAULT_LOCALE);
  // title + slug per locale (shown in UI when non-default tab active)
  const [trFields, setTrFields] = useState<Record<string, { title: string; slug: string }>>(() => {
    const map: Record<string, { title: string; slug: string }> = {};
    for (const tr of initialTranslations) {
      map[tr.locale] = { title: tr.title ?? "", slug: tr.slug ?? "" };
    }
    return map;
  });
  // Content per locale: controlled state. Storato qui (non in trFields) perché
  // l'aggiornamento avviene via TipTap onUpdate, separato dalle handler di
  // title/slug. Pattern uniforme con title/slug: hidden input value={...}.
  // (Il pattern precedente con defaultValue + callback ref aveva un bug:
  // in React 19 le callback ref inline sono ri-eseguite ad ogni render,
  // creando finestre in cui il ref è null e il DOM value non persisteva.)
  const [trContent, setTrContent] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialTranslations.map((t) => [t.locale, t.content ?? ""])),
  );
  // Snapshot iniziale per ripristinare il contenuto al tab switch senza
  // perdere le modifiche correnti (sincronizzato dal flusso onUpdate).
  // Initial slugs per locale for "slug changed" detection
  const initialTrSlugs = Object.fromEntries(
    initialTranslations.map((t) => [t.locale, t.slug ?? ""]),
  );
  // ───────────────────────────────────────────────────────────────────────────

  const [state, action, isPending] = useActionState(upsertPageAction, {});
  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [status, setStatus] = useState<"draft" | "published">(
    (page?.status as "draft" | "published") ?? "draft",
  );
  // Defensive cast: pages migrated from the legacy route_registry table
  // may still carry visibility values like 'admin' or 'auth-only' until
  // migration 0044 normalizes them. Treat anything that's not in the
  // canonical set as 'public' so the editor never feeds Zod a value it
  // will reject at save time.
  const [visibility, setVisibility] = useState<"public" | "private">(
    page?.visibility === "private" ? "private" : "public",
  );
  const [publishedAt, setPublishedAt] = useState(
    page?.publishedAt ? toDatetimeLocal(page.publishedAt) : "",
  );
  const [expiresAt, setExpiresAt] = useState(
    page?.expiresAt ? toDatetimeLocal(page.expiresAt) : "",
  );
  const [parentId, setParentId] = useState<number | null>(
    page?.parentId ?? initialParentId ?? null,
  );
  const [templateId, setTemplateId] = useState<number | null>(
    page?.templateId ?? initialTemplateId ?? null,
  );
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    () => {
      try {
        return JSON.parse(page?.customFields ?? "{}");
      } catch {
        return {};
      }
    },
  );
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const contentRef = useRef<HTMLInputElement>(null);

  // ── SEO state (controlled, salvato nello stesso form della pagina) ─────────
  // Tutti i campi SEO sono nel main form come hidden input. Niente più modal:
  // il tab SEO mostra i campi inline e il save dell'header li salva insieme
  // a tutto il resto della pagina.
  const [seoTitle, setSeoTitle] = useState(seo?.title ?? "");
  const [seoDescription, setSeoDescription] = useState(seo?.description ?? "");
  const [seoOgTitle, setSeoOgTitle] = useState(seo?.ogTitle ?? "");
  const [seoOgDescription, setSeoOgDescription] = useState(seo?.ogDescription ?? "");
  const [seoOgImage, setSeoOgImage] = useState(seo?.ogImage ?? "");
  const [seoRobots, setSeoRobots] = useState<RobotsValue>((seo?.robots as RobotsValue) ?? "");
  const [seoJsonLdEnabled, setSeoJsonLdEnabled] = useState<boolean>(seo?.jsonLdEnabled === true);
  const [seoJsonLdType, setSeoJsonLdType] = useState<JsonLdType | "">(
    (seo?.jsonLdType as JsonLdType | null | undefined) ?? "",
  );
  // Overlay per locale dei 4 campi testuali. Stesso pattern di trFields/trContent.
  type SeoTrFields = { title: string; description: string; ogTitle: string; ogDescription: string };
  const [seoTrFields, setSeoTrFields] = useState<Record<string, SeoTrFields>>(() => {
    const map: Record<string, SeoTrFields> = {};
    for (const tr of initialSeoTranslations) {
      map[tr.locale] = {
        title: tr.title ?? "",
        description: tr.description ?? "",
        ogTitle: tr.ogTitle ?? "",
        ogDescription: tr.ogDescription ?? "",
      };
    }
    return map;
  });

  const parentPage = pages.find((p) => p.id === parentId) ?? null;
  // Template attualmente selezionato: usato sia per il render dei custom
  // fields sia per pescare l'extension del modulo abbinato (matching per
  // `templateSlug`). Calcolato qui in cima perché il `moduleSlugPrefix`
  // sotto ne dipende.
  const selectedTemplate =
    templates.find((tpl) => tpl.id === templateId) ?? null;
  // Extension del modulo che ha "claimato" questo template (es. modulo
  // news registra `templateSlug: "news"`). Null se nessun modulo ha
  // registrato per questo template — il page-editor si comporta come
  // CMS vanilla.
  const moduleExtension = useMemo<PageTemplateExtension | null>(() => {
    if (!selectedTemplate) return null;
    return (
      moduleExtensions.find((e) => e.templateSlug === selectedTemplate.slug) ??
      null
    );
  }, [moduleExtensions, selectedTemplate?.slug]);
  // Slug prefix dall'extension del modulo se ne ha registrata una (es.
  // modulo news → prefix da customFields.category). Il core CMS non
  // conosce nessun modulo: applica solo la `SlugResolverSpec` passata
  // come dato dal caller. Senza extension, fallback al pattern parent
  // CMS standard.
  const moduleSlugPrefix = (() => {
    const r = moduleExtension?.slugResolver;
    if (!r) return null;
    const value = (customFields[r.fieldKey] ?? "").toLowerCase().trim();
    const prefix = r.prefixMap[value] ?? r.fallback;
    return `${prefix}/`;
  })();
  const slugPrefix =
    moduleSlugPrefix ?? (parentPage ? `${parentPage.slug}/` : "");
  const slugLeaf = leafSlug(slug) || slug;

  // URL pubblico: solo per pagine pubblicate già salvate
  const previewUrl =
    isEdit && status === "published" ? buildPreviewUrl(domain, slug) : null;

  useEffect(() => {
    if (!state?.savedAt) return;
    if (!isEdit && state.createdId) {
      const pagesBase = buildAdminPathFromSlug(
        adminSlug,
        getAdminRelPath("content-pages"),
      );
      router.replace(`${pagesBase}/${state.createdId}/edit`);
      return;
    }
    setSavedAt(
      new Date(state.savedAt).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    router.refresh();
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [state?.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({
    extensions: [
      // `blockquote: false` per non duplicare il node — lo registriamo subito
      // dopo via BlockquoteStyled (estende il default aggiungendo `data-style`).
      // I 6 levels di heading sono abilitati tutti — la toolbar mostra una
      // select con Paragraph + H1…H6.
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        blockquote: false,
      }),
      BlockquoteStyled,
      Underline,
      // Link esteso: target/rel sono parte dello schema dell'attributo così
      // sopravvivono al round-trip HTML→ProseMirror→HTML. Il default Tiptap
      // v3 espone `target` ma scarta `rel`; senza queste estensioni il
      // dialog UI sembrerebbe funzionare ma il `rel` salvato verrebbe perso
      // alla riapertura della pagina nell'editor.
      Link.extend({
        addAttributes() {
          const parent = this.parent?.() ?? {};
          return {
            ...parent,
            target: {
              default: null,
              parseHTML: (el) => (el as HTMLElement).getAttribute("target"),
              renderHTML: (attrs) =>
                attrs.target ? { target: attrs.target } : {},
            },
            rel: {
              default: null,
              parseHTML: (el) => (el as HTMLElement).getAttribute("rel"),
              renderHTML: (attrs) => (attrs.rel ? { rel: attrs.rel } : {}),
            },
          };
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: { class: "underline" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // Custom node `figureImage`: sostituisce il default Image extension.
      // Output: <figure class="cms-figure" data-align data-zoom style="width:N%">
      //         <img>+<figcaption>. NodeView React in editor con floating
      //         toolbar (width/align/zoom + caption inline). Vedi
      //         figure-image-node.tsx per dettagli.
      FigureImage,
    ],
    content: page?.content ?? "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "tiptap-editor" } },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const cur = activeLangRef.current;
      if (cur === DEFAULT_LOCALE) {
        if (contentRef.current) contentRef.current.value = html;
      } else {
        // Controlled state: aggiornamento via setter, hidden input legge
        // dal trContent[locale]. setState ad ogni keystroke è ok — TipTap
        // mantiene la propria istanza ProseMirror (no perdita caret).
        setTrContent((prev) => (prev[cur] === html ? prev : { ...prev, [cur]: html }));
      }
    },
  });
  useEffect(() => {
    if (editor && contentRef.current)
      contentRef.current.value = editor.getHTML();
  }, [editor]);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!isEdit) {
      const leaf = slugify(val);
      setSlug(buildFullSlug(slugPrefix, leaf));
    }
  }
  function handleSlugLeafChange(leafVal: string) {
    setSlug(buildFullSlug(slugPrefix, leafVal));
  }

  // Quando il prefix del modulo cambia (perché l'admin ha cambiato il
  // custom field controllato dallo slug resolver), ri-applica il nuovo
  // prefix mantenendo il leaf scelto. Senza, cambiare "altcoin" →
  // "bitcoin" non aggiornerebbe il path finché l'admin non tocca lo slug.
  useEffect(() => {
    if (!moduleSlugPrefix) return;
    const currentLeaf = leafSlug(slug) || slugify(title);
    const next = buildFullSlug(moduleSlugPrefix, currentLeaf);
    if (next !== slug) setSlug(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleSlugPrefix]);
  function handleParentChange(newParentId: number | null) {
    setParentId(newParentId);
    const leaf = leafSlug(slug) || slugify(title);
    if (newParentId) {
      const parent = pages.find((p) => p.id === newParentId);
      if (parent) setSlug(`${parent.slug}/${leaf}`);
    } else {
      setSlug(leaf);
    }
  }
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogInitial, setLinkDialogInitial] = useState<LinkDialogValue>({
    href: "",
    target: null,
    rel: null,
  });
  function handleLinkInsert() {
    if (!editor) return;
    const attrs = editor.getAttributes("link") as {
      href?: string;
      target?: string | null;
      rel?: string | null;
    };
    setLinkDialogInitial({
      href: attrs.href ?? "",
      target: attrs.target ?? null,
      rel: attrs.rel ?? null,
    });
    setLinkDialogOpen(true);
  }
  function handleLinkDialogSubmit(value: LinkDialogValue) {
    setLinkDialogOpen(false);
    if (!editor) return;
    if (!value.href) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: value.href,
        target: value.target ?? null,
        rel: value.rel ?? null,
      })
      .run();
  }
  const [internalLinkOpen, setInternalLinkOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
  function handleOpenSource() {
    if (!editor) return;
    setSourceValue(editor.getHTML());
    setSourceOpen(true);
  }
  function handleApplySource() {
    if (!editor) return;
    // Tiptap valida l'HTML contro gli extension schemi: tag non noti
    // (es. <table>) vengono droppati silenziosamente. Lo dichiariamo
    // come hint nel dialog. parseOptions.preserveWhitespace mantiene
    // formatting per textarea che usa <pre>-style paste.
    editor
      .chain()
      .focus()
      .setContent(sourceValue, { emitUpdate: true, parseOptions: { preserveWhitespace: "full" } })
      .run();
    setSourceOpen(false);
  }
  function handleInternalLinkPicked(p: InternalLinkPage) {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    const href = `/${p.slug}`;
    if (empty) {
      // Niente selezione → inseriamo il titolo come link (più utile del solo URL).
      editor
        .chain()
        .focus()
        .insertContent(
          `<a href="${href}">${escapeHtml(p.title)}</a>`,
        )
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setLink({ href })
        .run();
    }
  }
  function handleInsertPlaceholder(token: string) {
    editor?.chain().focus().insertContent(token).run();
  }

  // Image picker per il rich text: open dal toolbar, scelta dal MediaPicker
  // (libreria + upload tab — stessa UI dei custom-fields image), insert
  // come node Tiptap Image. Non blocchiamo all'asset.altText: il MediaPicker
  // ritorna il filename come fallback "alt", l'utente può poi editarlo
  // direttamente nel content (Tiptap supporta `alt` come attributo node).
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  function handleImagePicked(asset: {
    publicUrl: string;
    filename: string;
    mime: string;
  }) {
    editor
      ?.chain()
      .focus()
      .setFigureImage({
        src: asset.publicUrl,
        alt: asset.filename,
        // Default sensati: full width, centro, no zoom, no caption.
        // L'utente affina via floating toolbar.
        width: 100,
        align: "center",
        zoom: false,
      })
      .run();
    setImagePickerOpen(false);
  }

  function handleLangTabSwitch(newLocale: string) {
    if (newLocale === activeLang) return;
    const currentHtml = editor?.getHTML() ?? "";
    const prevLocale = activeLangRef.current;

    // Salva il contenuto del tab corrente prima di cambiarlo
    if (prevLocale === DEFAULT_LOCALE) {
      if (contentRef.current) contentRef.current.value = currentHtml;
    } else {
      setTrContent((prev) => (prev[prevLocale] === currentHtml ? prev : { ...prev, [prevLocale]: currentHtml }));
    }

    // Carica il contenuto del nuovo tab nell'editor
    let nextContent = "";
    if (newLocale === DEFAULT_LOCALE) {
      nextContent = contentRef.current?.value ?? page?.content ?? "";
    } else {
      nextContent = trContent[newLocale] ?? "";
    }
    editor?.commands.setContent(nextContent);

    activeLangRef.current = newLocale;
    setActiveLang(newLocale);
  }
  function handleLocaleFieldChange(locale: string, field: "title" | "slug", val: string) {
    setTrFields((prev) => ({
      ...prev,
      [locale]: { ...(prev[locale] ?? { title: "", slug: "" }), [field]: val },
    }));
  }

  // (selectedTemplate calcolato sopra, vicino a moduleExtension/moduleSlugPrefix)

  // Lista pagine selezionabili nel picker "Link a pagina interna":
  //   - solo pubblicate (le draft non sono navigabili e creerebbero link 404)
  //   - escluso self (no auto-link a sé)
  //   - escluse system meta-only (sign-in/sign-up/...): non sono URL CMS,
  //     i loro slug sono serviti da page handler dedicati e non vogliamo
  //     che un editor inserisca link verso pagine "fantasma".
  const internalLinkPages = useMemo<InternalLinkPage[]>(
    () =>
      pages
        .filter(
          (p) =>
            p.status === "published" &&
            (!page?.id || p.id !== page.id) &&
            !(p.isSystem && p.contentEditable === false),
        )
        .map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          parentId: p.parentId ?? null,
        })),
    [pages, page?.id],
  );

  // L'avviso "verrà creato un redirect 301" ha senso SOLO se il vecchio
  // slug era effettivamente raggiungibile, ovvero se la pagina è stata
  // pubblicata almeno una volta (publishedAt !== null). Una pagina
  // ancora in draft con slug cambiato non ha redirect da creare: il
  // vecchio URL non è mai stato online.
  const wasEverPublished = page?.publishedAt != null;
  const slugChanged =
    isEdit && slug !== originalSlug && slug.trim() !== "" && wasEverPublished;

  return (
    <>
      <style>{`
        .tiptap-editor { min-height: 440px; padding: 1rem 1.25rem; outline: none; font-size: 0.9375rem; line-height: 1.75; color: var(--admin-text); }
        .tiptap-editor h2 { font-size: 1.375rem; font-weight: 700; margin: 1.25em 0 0.5em; }
        .tiptap-editor h3 { font-size: 1.125rem; font-weight: 600; margin: 1em 0 0.4em; }
        .tiptap-editor h4 { font-size: 1rem; font-weight: 600; margin: 0.8em 0 0.3em; }
        .tiptap-editor p { margin: 0 0 0.75em; }
        .tiptap-editor p:last-child { margin-bottom: 0; }
        .tiptap-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.5em 0; }
        .tiptap-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5em 0; }
        .tiptap-editor li { margin: 0.2em 0; }
        .tiptap-editor a { color: var(--admin-accent); text-decoration: underline; }
        .tiptap-editor hr { border: none; border-top: 1px solid var(--admin-divider); margin: 1.5em 0; }
        .tiptap-editor code { font-family: monospace; font-size: 0.875em; background: var(--admin-hover-bg); padding: 0.1em 0.35em; border-radius: 0.25rem; }
        .tiptap-editor pre { background: var(--admin-hover-bg); padding: 1em; border-radius: 0.5rem; overflow-x: auto; margin: 0.75em 0; }
        .tiptap-editor pre code { background: none; padding: 0; }
        /* Blockquote — 4 varianti via data-style. Stessi pattern visivi
           del frontend (frontend.css), parametrizzati sui token --admin-*
           per restare coerenti con il dark theme dell'editor.
           - default: border-left + italic (classico)
           - card: box riempito, border morbido, no italic
           - pull: pull-quote grande centrata, no border, font 1.5x
           - quoted: virgolette tipografiche generate via ::before/::after */
        .tiptap-editor blockquote { margin: 0.75em 0; padding-left: 1rem; border-left: 3px solid var(--admin-accent); color: var(--admin-text-muted); font-style: italic; }
        .tiptap-editor blockquote[data-style="card"] { border-left: none; padding: 0.75em 1em; background: var(--admin-hover-bg); border-radius: 0.5rem; font-style: normal; color: var(--admin-text); }
        .tiptap-editor blockquote[data-style="pull"] { border-left: none; padding: 0.5em 0; margin: 1.25em auto; max-width: 36rem; text-align: center; font-size: 1.375em; line-height: 1.4; font-weight: 600; font-style: normal; color: var(--admin-text); }
        .tiptap-editor blockquote[data-style="quoted"] { border-left: none; padding: 0.5em 2.25em; margin: 1.25em 0; position: relative; font-style: italic; color: var(--admin-text-muted); }
        .tiptap-editor blockquote[data-style="quoted"]::before { content: "\\201C"; position: absolute; left: 0; top: -0.1em; font-size: 3em; line-height: 1; color: var(--admin-accent); opacity: 0.5; font-family: Georgia, serif; }
        .tiptap-editor blockquote[data-style="quoted"]::after { content: "\\201D"; position: absolute; right: 0; bottom: -0.6em; font-size: 3em; line-height: 1; color: var(--admin-accent); opacity: 0.5; font-family: Georgia, serif; }
        .tiptap-editor strong { font-weight: 700; }
        /* Editor ↔ frontend WYSIWYG: stessi data-align/float usati in
           (cms)/frontend.css. Così quando l'admin imposta align=left,
           il testo del paragrafo successivo si avvolge a destra anche
           DENTRO l'editor — niente più discrepanza visiva con il render
           finale online. Niente media query mobile (l'editor è desktop). */
        .tiptap-editor figure.cms-figure { margin: 1em 0; box-sizing: border-box; }
        .tiptap-editor figure.cms-figure[data-align="left"] { float: left; margin: 0.25em 1.25em 0.5em 0; }
        .tiptap-editor figure.cms-figure[data-align="right"] { float: right; margin: 0.25em 0 0.5em 1.25em; }
        .tiptap-editor figure.cms-figure[data-align="center"] { margin-left: auto; margin-right: auto; }
        .tiptap-editor figure.cms-figure[data-align="full"] { width: 100% !important; margin-left: 0; margin-right: 0; clear: both; }
        /* Heading/blockquote/hr rompono il wrap del float (clear:both).
           Comportamento simmetrico al frontend (frontend.css) — un H2
           dopo immagine floated va a capo. Paragrafi NON clear-ano:
           continuano l'avvolgimento finché non superano l'altezza
           dell'immagine, esattamente come nel render online. */
        .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor blockquote, .tiptap-editor hr { clear: both; }
        .tiptap-editor em { font-style: italic; }
        .tiptap-editor .ProseMirror-focused { outline: none; }
      `}</style>

      <form id={FORM_ID} action={action} className="space-y-0">
        {isEdit && page?.id && (
          <input type="hidden" name="id" value={page.id} />
        )}
        {isEdit && (
          <input type="hidden" name="originalSlug" value={originalSlug} />
        )}
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="content" ref={contentRef} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="visibility" value={visibility} />
        <input type="hidden" name="publishedAt" value={publishedAt} />
        <input type="hidden" name="expiresAt" value={expiresAt} />
        <input type="hidden" name="parentId" value={parentId ?? ""} />
        <input type="hidden" name="templateId" value={templateId ?? ""} />
        <input
          type="hidden"
          name="customFields"
          value={JSON.stringify(customFields)}
        />
        {/* isSystem e pageType: necessari per il versioning automatico */}
        <input type="hidden" name="isSystem" value={isSystem ? "1" : "0"} />
        <input type="hidden" name="pageType" value={pageType} />
        {/* Traduzioni per locale non-default — tutti hidden input controlled */}
        {nonDefaultLocales.map((loc) => (
          <Fragment key={loc.code}>
            <input type="hidden" name={`tr_${loc.code}_title`} value={trFields[loc.code]?.title ?? ""} readOnly />
            <input type="hidden" name={`tr_${loc.code}_slug`} value={trFields[loc.code]?.slug ?? ""} readOnly />
            <input type="hidden" name={`tr_${loc.code}_content`} value={trContent[loc.code] ?? ""} readOnly />
          </Fragment>
        ))}
        {/* SEO base (default locale) */}
        <input type="hidden" name="seoTitle" value={seoTitle} readOnly />
        <input type="hidden" name="seoDescription" value={seoDescription} readOnly />
        <input type="hidden" name="seoOgTitle" value={seoOgTitle} readOnly />
        <input type="hidden" name="seoOgDescription" value={seoOgDescription} readOnly />
        <input type="hidden" name="seoOgImage" value={seoOgImage} readOnly />
        <input type="hidden" name="seoRobots" value={seoRobots} readOnly />
        <input type="hidden" name="seoJsonLdEnabled" value={seoJsonLdEnabled ? "true" : "false"} readOnly />
        <input type="hidden" name="seoJsonLdType" value={seoJsonLdType} readOnly />
        {/* Traduzioni SEO per locale non-default */}
        {nonDefaultLocales.map((loc) => (
          <Fragment key={`seo-tr-${loc.code}`}>
            <input type="hidden" name={`seo_tr_${loc.code}_title`} value={seoTrFields[loc.code]?.title ?? ""} readOnly />
            <input type="hidden" name={`seo_tr_${loc.code}_description`} value={seoTrFields[loc.code]?.description ?? ""} readOnly />
            <input type="hidden" name={`seo_tr_${loc.code}_ogTitle`} value={seoTrFields[loc.code]?.ogTitle ?? ""} readOnly />
            <input type="hidden" name={`seo_tr_${loc.code}_ogDescription`} value={seoTrFields[loc.code]?.ogDescription ?? ""} readOnly />
          </Fragment>
        ))}

        <EditorPageHeader
          backHref={buildAdminPathFromSlug(adminSlug, getAdminRelPath("content-pages"))}
          backLabel={t("backButton")}
          saveLabel={isEdit ? t("saveButton") : t("createButton")}
          savedAtLabel={(time) => t("savedAtLabel", { time })}
          formId={FORM_ID}
          isPending={isPending}
          savedAt={savedAt}
          error={state?.error}
          pageId={isEdit ? page?.id : null}
          pageStatus={status}
          previewUrl={previewUrl}
        />

        {/* Titolo + Slug */}
        <div
          className="rounded-xl mb-5"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {/* Language tab strip (ProcessWire style) */}
          {isMultilocale && (
            <div
              className="flex items-center gap-1 px-4 pt-3 pb-0"
              style={{ borderBottom: "1px solid var(--admin-divider)" }}>
              <Globe size={12} style={{ color: "var(--admin-text-faint)", marginRight: "4px" }} />
              {[{ code: DEFAULT_LOCALE, label: DEFAULT_LOCALE.toUpperCase() }, ...nonDefaultLocales.map(l => ({ code: l.code, label: l.code.toUpperCase() }))].map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleLangTabSwitch(code)}
                  className="relative px-3 py-2 text-xs font-semibold tracking-wide transition-colors"
                  style={{
                    color: activeLang === code ? "var(--admin-accent)" : "var(--admin-text-muted)",
                    borderBottom: activeLang === code ? "2px solid var(--admin-accent)" : "2px solid transparent",
                    marginBottom: "-1px",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="p-5 space-y-4">
            {activeLang === DEFAULT_LOCALE ? (
              /* ── Default locale: title + slug uno per riga, sempre. ── */
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label style={labelStyle}>{t("titleLabel")}</label>
                  <input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder={t("titlePlaceholder")}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: "0.375rem" }}>
                    {t("slugLabel")}
                  </label>
                  <div className="flex">
                    <span
                      className="px-3 py-2 text-sm rounded-l-lg shrink-0 select-none"
                      style={{
                        background: "var(--admin-hover-bg)",
                        border: "1px solid var(--admin-input-border)",
                        borderRight: "none",
                        color: slugPrefix
                          ? "var(--admin-text-muted)"
                          : "var(--admin-text-faint)",
                        fontSize: "0.875rem",
                        fontFamily: "monospace",
                        maxWidth: "180px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={`/${slugPrefix}`}>
                      /{slugPrefix}
                    </span>
                    <input
                      value={slugLeaf}
                      onChange={(e) => handleSlugLeafChange(e.target.value)}
                      placeholder={t("slugLeafPlaceholder")}
                      disabled={!slugEditable}
                      style={{
                        ...inputStyle,
                        borderRadius: "0 0.5rem 0.5rem 0",
                        fontFamily: "monospace",
                        cursor: slugEditable ? undefined : "not-allowed",
                        opacity: slugEditable ? 1 : 0.7,
                      }}
                    />
                  </div>
                  {!slugEditable ? (
                    <p
                      style={{
                        ...hintStyle,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}>
                      <Lock size={11} />
                      {t("slugLockedHint")}
                    </p>
                  ) : slugChanged ? (
                    <div
                      className="flex items-start gap-2 mt-2 rounded-lg px-3 py-2"
                      style={{
                        background:
                          "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
                        border:
                          "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
                      }}>
                      <AlertTriangle
                        size={13}
                        className="mt-0.5 shrink-0"
                        style={{ color: "#f59e0b" }}
                      />
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: "var(--admin-text-muted)" }}>
                        {t("slugChangedNoticeBefore")}{" "}
                        <code
                          className="font-mono"
                          style={{ color: "var(--admin-text)" }}>
                          /{originalSlug}
                        </code>{" "}
                        {t("slugChangedNoticeMiddle")}{" "}
                        <code
                          className="font-mono"
                          style={{ color: "var(--admin-text)" }}>
                          /{slug}
                        </code>
                        {t("slugChangedNoticeAfter")}
                      </p>
                    </div>
                  ) : (
                    <p style={hintStyle}>
                      {t("slugUrlHintLabel")}{" "}
                      <strong style={{ color: "var(--admin-text-muted)" }}>
                        /{slug || t("slugUrlHintFallback")}
                      </strong>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* ── Non-default locale: locale title + slug uno per riga, sempre. ── */
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label style={labelStyle}>{t("langTitleLabel")}</label>
                  <input
                    value={trFields[activeLang]?.title ?? ""}
                    onChange={(e) => handleLocaleFieldChange(activeLang, "title", e.target.value)}
                    placeholder={t("langTitlePlaceholder")}
                    style={inputStyle}
                  />
                  <p style={hintStyle}>{t("langTitleHint")}</p>
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: "0.375rem" }}>
                    {t("langSlugLabel")}
                  </label>
                  {isSystem ? (
                    /* System page — slug is uniform across all locales by
                       policy. We show the canonical slug as read-only so
                       the admin always sees the real path; the proxy
                       handles /{locale}/system-route → /system-route
                       redirect anyway, but it's confusing to display a
                       locale-prefixed editable input when the value is
                       meant to be the same everywhere. */
                    <>
                      <div
                        className="px-3 py-2 text-sm rounded-lg select-text"
                        style={{
                          background: "var(--admin-hover-bg)",
                          border: "1px solid var(--admin-input-border)",
                          color: "var(--admin-text-muted)",
                          fontFamily: "monospace",
                          opacity: 0.85,
                        }}>
                        /{slug || t("slugUrlHintFallback")}
                      </div>
                      <p
                        style={{
                          ...hintStyle,
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}>
                        <Lock size={11} />
                        {t("langSlugSystemHint")}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex">
                        <span
                          className="px-3 py-2 text-sm rounded-l-lg shrink-0 select-none"
                          style={{
                            background: "var(--admin-hover-bg)",
                            border: "1px solid var(--admin-input-border)",
                            borderRight: "none",
                            color: "var(--admin-text-muted)",
                            fontSize: "0.875rem",
                            fontFamily: "monospace",
                          }}>
                          /{activeLang}/
                        </span>
                        <input
                          value={trFields[activeLang]?.slug ?? ""}
                          onChange={(e) => handleLocaleFieldChange(activeLang, "slug", e.target.value)}
                          placeholder={t("langSlugPlaceholder")}
                          disabled={!slugEditable}
                          style={{
                            ...inputStyle,
                            borderRadius: "0 0.5rem 0.5rem 0",
                            fontFamily: "monospace",
                            cursor: slugEditable ? undefined : "not-allowed",
                            opacity: slugEditable ? 1 : 0.7,
                          }}
                        />
                      </div>
                      {!slugEditable ? (
                        <p
                          style={{
                            ...hintStyle,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}>
                          <Lock size={11} />
                          {t("langSlugLockedHint")}
                        </p>
                      ) : isEdit && trFields[activeLang]?.slug !== initialTrSlugs[activeLang] && (trFields[activeLang]?.slug || initialTrSlugs[activeLang]) ? (
                        <div
                          className="flex items-start gap-2 mt-2 rounded-lg px-3 py-2"
                          style={{
                            background: "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
                            border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
                          }}>
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: "#f59e0b" }} />
                          <p className="text-xs leading-relaxed" style={{ color: "var(--admin-text-muted)" }}>
                            {t("langSlugChangedNotice")}
                          </p>
                        </div>
                      ) : (
                        <p style={hintStyle}>
                          {t("langSlugHint", { locale: activeLang, slug: trFields[activeLang]?.slug || t("slugUrlHintFallback") })}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isMetaOnly &&
          selectedTemplate &&
          (selectedTemplate.fields.length > 0 ||
            (moduleExtension?.fields.length ?? 0) > 0) && (
            <CustomFieldsBlock
              template={selectedTemplate}
              customFields={customFields}
              setCustomFields={setCustomFields}
              moduleExtension={moduleExtension}
            />
          )}

        {/* Tabs */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div
            className="flex overflow-x-auto"
            style={{ borderBottom: "1px solid var(--admin-divider)" }}>
            {!isMetaOnly && (
              <>
                <TabBtn
                  active={activeTab === "content"}
                  onClick={() => setActiveTab("content")}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10,9 9,9 8,9" />
                  </svg>
                  {t("tabContent")}
                </TabBtn>
                <TabBtn
                  active={activeTab === "struttura"}
                  onClick={() => setActiveTab("struttura")}>
                  <GitBranch size={14} />
                  {t("tabStructure")}
                  {(parentId || templateId) && (
                    <span
                      className="w-1.5 h-1.5 rounded-full ml-0.5"
                      style={{ background: "var(--admin-accent)" }}
                    />
                  )}
                </TabBtn>
              </>
            )}
            <TabBtn
              active={activeTab === "seo"}
              onClick={() => setActiveTab("seo")}>
              <Search size={14} />
              {t("tabSeo")}
              {!seo && (
                <span
                  className="w-1.5 h-1.5 rounded-full ml-0.5"
                  style={{ background: "#f59e0b" }}
                />
              )}
            </TabBtn>
            {!isMetaOnly && (
              <TabBtn
                active={activeTab === "pub"}
                onClick={() => setActiveTab("pub")}>
                <Calendar size={14} />
                <span className="hidden sm:inline">
                  {t("tabPublishing")}
                </span>
                <span className="sm:hidden">{t("tabPubShort")}</span>
              </TabBtn>
            )}
          </div>

          {activeTab === "content" && (
            <>
              <div
                className="flex flex-wrap items-center gap-0.5 px-3 py-2"
                style={{
                  borderBottom: "1px solid var(--admin-divider)",
                  background: "var(--admin-page-bg)",
                }}>
                <TBtn
                  onClick={() => editor?.chain().focus().undo().run()}
                  title={t("toolbarUndo")}
                  disabled={!editor?.can().undo()}>
                  <RotateCcw size={15} />
                </TBtn>
                <TBtn
                  onClick={() => editor?.chain().focus().redo().run()}
                  title={t("toolbarRedo")}
                  disabled={!editor?.can().redo()}>
                  <RotateCw size={15} />
                </TBtn>
                <TDivider />
                <HeadingMenu editor={editor} />
                <TDivider />
                <TBtn
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  active={editor?.isActive("bold")}
                  title={t("toolbarBold")}>
                  <Bold size={15} />
                </TBtn>
                <TBtn
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  active={editor?.isActive("italic")}
                  title={t("toolbarItalic")}>
                  <Italic size={15} />
                </TBtn>
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().toggleUnderline().run()
                  }
                  active={editor?.isActive("underline")}
                  title={t("toolbarUnderline")}>
                  <UnderlineIcon size={15} />
                </TBtn>
                <TBtn
                  onClick={() => editor?.chain().focus().toggleCode().run()}
                  active={editor?.isActive("code")}
                  title={t("toolbarCode")}>
                  <Code size={15} />
                </TBtn>
                <TDivider />
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().toggleBulletList().run()
                  }
                  active={editor?.isActive("bulletList")}
                  title={t("toolbarBulletList")}>
                  <List size={15} />
                </TBtn>
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().toggleOrderedList().run()
                  }
                  active={editor?.isActive("orderedList")}
                  title={t("toolbarOrderedList")}>
                  <ListOrdered size={15} />
                </TBtn>
                <TDivider />
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().setTextAlign("left").run()
                  }
                  active={editor?.isActive({ textAlign: "left" })}
                  title={t("toolbarAlignLeft")}>
                  <AlignLeft size={15} />
                </TBtn>
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().setTextAlign("center").run()
                  }
                  active={editor?.isActive({ textAlign: "center" })}
                  title={t("toolbarAlignCenter")}>
                  <AlignCenter size={15} />
                </TBtn>
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().setTextAlign("right").run()
                  }
                  active={editor?.isActive({ textAlign: "right" })}
                  title={t("toolbarAlignRight")}>
                  <AlignRight size={15} />
                </TBtn>
                <TDivider />
                <LinkMenu
                  editor={editor}
                  internalPages={internalLinkPages}
                  onOpenInternalPicker={() => setInternalLinkOpen(true)}
                  onSetExternalLink={handleLinkInsert}
                />
                <BlockquoteMenu editor={editor} />
                <TBtn
                  onClick={() => setImagePickerOpen(true)}
                  title={t("toolbarImage")}>
                  <ImagePlus size={15} />
                </TBtn>
                <TBtn
                  onClick={() =>
                    editor?.chain().focus().setHorizontalRule().run()
                  }
                  title={t("toolbarSeparator")}>
                  <Minus size={15} />
                </TBtn>
                <TDivider />
                <TBtn
                  onClick={handleOpenSource}
                  title={t("toolbarSource")}>
                  <Code2 size={15} />
                </TBtn>
              </div>
              <div className="px-3 pt-2">
                <PlaceholderHint onInsert={handleInsertPlaceholder} />
              </div>
              <EditorContent editor={editor} />
              <MediaPicker
                open={imagePickerOpen}
                imageOnly
                onClose={() => setImagePickerOpen(false)}
                onSelect={handleImagePicked}
              />
              <InternalLinkPicker
                open={internalLinkOpen}
                pages={internalLinkPages}
                onClose={() => setInternalLinkOpen(false)}
                onSelect={handleInternalLinkPicked}
              />
              <LinkDialog
                open={linkDialogOpen}
                initial={linkDialogInitial}
                onClose={() => setLinkDialogOpen(false)}
                onSubmit={handleLinkDialogSubmit}
              />
              <AdminDialog open={sourceOpen} onOpenChange={setSourceOpen}>
                <AdminDialogContent
                  icon={Code2}
                  title={t("sourceDialogTitle")}
                  description={t("sourceDialogDescription")}
                  size="xl"
                  footer={
                    <>
                      <AdminDialogCancelButton onClick={() => setSourceOpen(false)}>
                        {t("sourceDialogCancel")}
                      </AdminDialogCancelButton>
                      <AdminDialogConfirmButton onClick={handleApplySource}>
                        {t("sourceDialogApply")}
                      </AdminDialogConfirmButton>
                    </>
                  }>
                  <textarea
                    value={sourceValue}
                    onChange={(e) => setSourceValue(e.target.value)}
                    spellCheck={false}
                    rows={20}
                    className="w-full px-3 py-2 rounded-lg text-xs leading-relaxed"
                    style={{
                      background: "var(--admin-page-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                      resize: "vertical",
                      minHeight: "320px",
                    }}
                    placeholder="<h2>Heading</h2>&#10;<p>Paragraph...</p>"
                  />
                  <p
                    className="text-xs mt-3 leading-relaxed"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {t("sourceDialogHint")}
                  </p>
                </AdminDialogContent>
              </AdminDialog>
            </>
          )}
          {activeTab === "struttura" && (
            <div className="p-5">
              <StrutturaTab
                pages={pages}
                templates={templates}
                parentId={parentId}
                onParentChange={handleParentChange}
                templateId={templateId}
                setTemplateId={setTemplateId}
                setCustomFields={setCustomFields}
                currentPageId={page?.id}
                templateLocked={templateLocked}
                canManageTemplates={canManageTemplates}
              />
            </div>
          )}
          {activeTab === "seo" && (
            <div className="p-5">
              <SeoFields
                title={seoTitle}
                setTitle={setSeoTitle}
                description={seoDescription}
                setDescription={setSeoDescription}
                ogTitle={seoOgTitle}
                setOgTitle={setSeoOgTitle}
                ogDescription={seoOgDescription}
                setOgDescription={setSeoOgDescription}
                ogImage={seoOgImage}
                setOgImage={setSeoOgImage}
                robots={seoRobots}
                setRobots={setSeoRobots}
                jsonLdEnabled={seoJsonLdEnabled}
                setJsonLdEnabled={setSeoJsonLdEnabled}
                jsonLdType={seoJsonLdType}
                setJsonLdType={setSeoJsonLdType}
                activeLang={activeLang}
                trFields={seoTrFields}
                setTrFields={setSeoTrFields}
                pathname={`/${slug}`}
                domain={domain}
                appName={appName}
              />
            </div>
          )}
          {activeTab === "pub" && (
            <div className="p-5">
              <PubTab
                status={status}
                setStatus={setStatus}
                publishedAt={publishedAt}
                setPublishedAt={setPublishedAt}
                expiresAt={expiresAt}
                setExpiresAt={setExpiresAt}
                slug={slug}
                visibility={visibility}
                setVisibility={setVisibility}
              />
            </div>
          )}
        </div>
      </form>
    </>
  );
}

function toDatetimeLocal(date: Date): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
