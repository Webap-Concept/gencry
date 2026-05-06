"use client";

import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { useTranslations } from "next-intl";
import { JSON_LD_TYPES, type JsonLdType } from "./jsonld-types";

export type { JsonLdType };

export type RobotsValue = "" | "noindex,nofollow" | "noindex,follow";

type FormT = ReturnType<typeof useTranslations<"admin.seo.form">>;

function getRobotsOptions(t: FormT): {
  value: RobotsValue;
  label: string;
  hint: string;
}[] {
  return [
    { value: "", label: t("robotsDefaultLabel"), hint: t("robotsDefaultHint") },
    {
      value: "noindex,nofollow",
      label: t("robotsNoIndexNoFollowLabel"),
      hint: t("robotsNoIndexNoFollowHint"),
    },
    {
      value: "noindex,follow",
      label: t("robotsNoIndexFollowLabel"),
      hint: t("robotsNoIndexFollowHint"),
    },
  ];
}

export function resolvePreview(text: string, appName: string): string {
  if (!appName || !text) return text;
  return text.replace(/\{appName\}/gi, appName);
}

const inputStyle = {
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  width: "100%",
  outline: "none",
} as React.CSSProperties;

const labelStyle = {
  fontSize: "0.65rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--admin-text-muted)",
};

const hintStyle = {
  fontSize: "0.75rem",
  color: "var(--admin-text-faint)",
};

// ─── SERP Preview ─────────────────────────────────────────────────────────────
export function Serp({
  title,
  description,
  pathname,
  domain,
  robots,
}: {
  title: string;
  description: string;
  pathname: string;
  domain: string;
  robots: RobotsValue;
}) {
  const t = useTranslations("admin.seo.form");
  const displayDomain = domain || "https://il-tuo-dominio.it";
  const isNoIndex = robots.startsWith("noindex");
  return (
    <div
      className="rounded-lg p-4 text-sm"
      style={{
        background: "var(--admin-surface)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center justify-between mb-1">
        <p
          style={{
            ...hintStyle,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
          {t("serpHeading")}
        </p>
        {isNoIndex && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              color: "var(--admin-accent)",
              border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
            }}>
            {t("serpNoIndexBadge")}
          </span>
        )}
      </div>
      <p className="text-base font-medium truncate" style={{ color: "#1a0dab" }}>
        {title || (
          <span style={hintStyle}>
            <em>{t("serpTitleEmpty")}</em>
          </span>
        )}
      </p>
      <p className="text-xs" style={{ color: "#006621" }}>
        {displayDomain}
        {pathname}
      </p>
      <p className="text-sm mt-0.5 line-clamp-2" style={{ color: "#545454" }}>
        {description || (
          <span style={hintStyle}>
            <em>{t("serpDescriptionEmpty")}</em>
          </span>
        )}
      </p>
    </div>
  );
}

function AppNameHint({ appName }: { appName: string }) {
  const t = useTranslations("admin.seo.form");
  if (!appName) return null;
  return (
    <p style={hintStyle}>
      {t("appNameHintBefore")}{" "}
      <code
        className="px-1 py-0.5 rounded font-mono"
        style={{ background: "var(--admin-hover-bg)", color: "var(--admin-text-muted)" }}>
        {"{"}appName{"}"}
      </code>{" "}
      {t("appNameHintAfter")}{" "}
      <strong style={{ color: "var(--admin-text-muted)" }}>{appName}</strong>.
    </p>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p style={labelStyle}>{label}</p>
          {hint && <p style={{ ...hintStyle, marginTop: "0.125rem" }}>{hint}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out"
          style={{
            background: checked ? "var(--admin-accent)" : "var(--admin-input-border)",
          }}>
          <span
            aria-hidden="true"
            className="pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out"
            style={{
              background: "white",
              transform: checked ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Inline SEO fields ────────────────────────────────────────────────────────
/**
 * Componente fully-controlled per i campi SEO, da inserire inline dentro
 * il form di una pagina (page-editor.tsx). Niente wrapper `<form>`, niente
 * action: gli hidden input del form padre catturano i valori controllati.
 *
 * Per il multi-locale: i 4 campi testuali (title, description, ogTitle,
 * ogDescription) si sovrappongono ai valori base quando `activeLang` è
 * diverso da DEFAULT_LOCALE. I campi tecnici (robots, JSON-LD, ogImage,
 * label) sono sempre shared — vengono nascosti nel tab non-default.
 */
type SeoTrFields = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
};

export function SeoFields({
  // Base SEO state (default locale)
  title,
  setTitle,
  description,
  setDescription,
  ogTitle,
  setOgTitle,
  ogDescription,
  setOgDescription,
  ogImage,
  setOgImage,
  robots,
  setRobots,
  jsonLdEnabled,
  setJsonLdEnabled,
  jsonLdType,
  setJsonLdType,
  // Translation overlay state (non-default locales)
  activeLang,
  trFields,
  setTrFields,
  // Context
  pathname,
  domain,
  appName,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  ogTitle: string;
  setOgTitle: (v: string) => void;
  ogDescription: string;
  setOgDescription: (v: string) => void;
  ogImage: string;
  setOgImage: (v: string) => void;
  robots: RobotsValue;
  setRobots: (v: RobotsValue) => void;
  jsonLdEnabled: boolean;
  setJsonLdEnabled: (v: boolean) => void;
  jsonLdType: JsonLdType | "";
  setJsonLdType: (v: JsonLdType | "") => void;
  activeLang: string;
  trFields: Record<string, SeoTrFields>;
  setTrFields: React.Dispatch<React.SetStateAction<Record<string, SeoTrFields>>>;
  pathname: string;
  domain: string;
  appName: string;
}) {
  const t = useTranslations("admin.seo.form");
  const robotsOptions = getRobotsOptions(t);
  const jsonLdTypeHints: Record<JsonLdType, string> = {
    WebPage: t("jsonLdHint_WebPage"),
    Article: t("jsonLdHint_Article"),
    BlogPosting: t("jsonLdHint_BlogPosting"),
    Product: t("jsonLdHint_Product"),
    FAQPage: t("jsonLdHint_FAQPage"),
    BreadcrumbList: t("jsonLdHint_BreadcrumbList"),
    Organization: t("jsonLdHint_Organization"),
    LocalBusiness: t("jsonLdHint_LocalBusiness"),
    Person: t("jsonLdHint_Person"),
    Event: t("jsonLdHint_Event"),
    VideoObject: t("jsonLdHint_VideoObject"),
  };

  const isDefaultLang = activeLang === DEFAULT_LOCALE;

  // Quando activeLang è non-default i 4 campi testuali sono visualizzati
  // dal trFields[activeLang]; in default leggono/scrivono dagli state base.
  const visibleTitle = isDefaultLang ? title : trFields[activeLang]?.title ?? "";
  const visibleDescription = isDefaultLang
    ? description
    : trFields[activeLang]?.description ?? "";
  const visibleOgTitle = isDefaultLang ? ogTitle : trFields[activeLang]?.ogTitle ?? "";
  const visibleOgDescription = isDefaultLang
    ? ogDescription
    : trFields[activeLang]?.ogDescription ?? "";

  function updateTrField(key: keyof SeoTrFields, value: string) {
    setTrFields((prev) => ({
      ...prev,
      [activeLang]: {
        ...(prev[activeLang] ?? {
          title: "",
          description: "",
          ogTitle: "",
          ogDescription: "",
        }),
        [key]: value,
      },
    }));
  }

  function handleTitleChange(v: string) {
    if (isDefaultLang) setTitle(v);
    else updateTrField("title", v);
  }
  function handleDescriptionChange(v: string) {
    if (isDefaultLang) setDescription(v);
    else updateTrField("description", v);
  }
  function handleOgTitleChange(v: string) {
    if (isDefaultLang) setOgTitle(v);
    else updateTrField("ogTitle", v);
  }
  function handleOgDescriptionChange(v: string) {
    if (isDefaultLang) setOgDescription(v);
    else updateTrField("ogDescription", v);
  }

  function handleToggleJsonLd(enabled: boolean) {
    setJsonLdEnabled(enabled);
    if (enabled && !jsonLdType) setJsonLdType("WebPage");
  }

  const currentHint =
    jsonLdType && jsonLdType in jsonLdTypeHints
      ? jsonLdTypeHints[jsonLdType as JsonLdType]
      : undefined;

  return (
    <div className="space-y-5">
      {/* SERP preview */}
      <Serp
        title={resolvePreview(visibleTitle, appName)}
        description={resolvePreview(visibleDescription, appName)}
        pathname={pathname}
        domain={domain}
        robots={robots}
      />

      {/* Meta Title */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label style={labelStyle}>{t("metaTitleLabel")}</label>
          <span
            className="text-xs"
            style={{
              color:
                visibleTitle.length === 0
                  ? "var(--admin-text-faint)"
                  : visibleTitle.length > 60
                    ? "var(--admin-error, #ef4444)"
                    : visibleTitle.length > 54
                      ? "var(--admin-warning, #d97706)"
                      : "var(--admin-success, #22c55e)",
            }}>
            {visibleTitle.length}/60
          </span>
        </div>
        <input
          value={visibleTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          maxLength={70}
          placeholder={t("metaTitlePlaceholder")}
          style={inputStyle}
        />
        <AppNameHint appName={appName} />
      </div>

      {/* Meta Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label style={labelStyle}>{t("metaDescriptionLabel")}</label>
          <span
            className="text-xs"
            style={{
              color:
                visibleDescription.length === 0
                  ? "var(--admin-text-faint)"
                  : visibleDescription.length > 155
                    ? "var(--admin-error, #ef4444)"
                    : visibleDescription.length > 139
                      ? "var(--admin-warning, #d97706)"
                      : "var(--admin-success, #22c55e)",
            }}>
            {visibleDescription.length}/155
          </span>
        </div>
        <textarea
          value={visibleDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          maxLength={160}
          rows={3}
          placeholder={t("metaDescriptionPlaceholder")}
          style={{ ...inputStyle, resize: "none" }}
        />
        <AppNameHint appName={appName} />
      </div>

      {/* Open Graph collapsible */}
      <details className="group">
        <summary
          className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide transition-colors"
          style={{ color: "var(--admin-text-faint)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--admin-text-muted)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--admin-text-faint)")
          }>
          {t("openGraphSummary")}
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <label style={labelStyle}>{t("ogTitleLabel")}</label>
            <input
              value={visibleOgTitle}
              onChange={(e) => handleOgTitleChange(e.target.value)}
              maxLength={70}
              placeholder={t("ogTitlePlaceholder")}
              style={inputStyle}
            />
            <AppNameHint appName={appName} />
          </div>
          <div className="space-y-1.5">
            <label style={labelStyle}>{t("ogDescriptionLabel")}</label>
            <textarea
              value={visibleOgDescription}
              onChange={(e) => handleOgDescriptionChange(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder={t("ogDescriptionPlaceholder")}
              style={{ ...inputStyle, resize: "none" }}
            />
            <AppNameHint appName={appName} />
          </div>
          {/* og:image è condiviso fra tutte le lingue (asset universale).
              Mostrato solo nel tab default per non confondere; quando si
              edita una traduzione gli altri campi shared restano stabili. */}
          {isDefaultLang && (
            <div className="space-y-1.5">
              <label style={labelStyle}>{t("ogImageLabel")}</label>
              <input
                value={ogImage}
                onChange={(e) => setOgImage(e.target.value)}
                placeholder={t("ogImagePlaceholder")}
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </details>

      {/* Robots e JSON-LD: shared, mostrati solo nel tab default. */}
      {isDefaultLang && (
        <>
          <div className="space-y-1.5">
            <label style={labelStyle}>{t("robotsLabel")}</label>
            <select
              value={robots}
              onChange={(e) => setRobots(e.target.value as RobotsValue)}
              style={inputStyle}>
              {robotsOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={hintStyle}>
              {robotsOptions.find((o) => o.value === robots)?.hint}
            </p>
          </div>

          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: "var(--admin-hover-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <Toggle
              label={t("jsonLdHeading")}
              hint={t("jsonLdToggleHint")}
              checked={jsonLdEnabled}
              onChange={handleToggleJsonLd}
            />
            <div
              className="overflow-hidden transition-all duration-200 ease-in-out"
              style={{
                maxHeight: jsonLdEnabled ? "140px" : "0px",
                opacity: jsonLdEnabled ? 1 : 0,
              }}>
              <div className="pt-1 space-y-1.5">
                <label style={labelStyle}>{t("jsonLdTypeLabel")}</label>
                <select
                  value={jsonLdType}
                  onChange={(e) => setJsonLdType(e.target.value as JsonLdType)}
                  style={inputStyle}>
                  <option value="" disabled>
                    {t("jsonLdTypePlaceholder")}
                  </option>
                  {JSON_LD_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {tp}
                    </option>
                  ))}
                </select>
                {currentHint && <p style={hintStyle}>{currentHint}</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
