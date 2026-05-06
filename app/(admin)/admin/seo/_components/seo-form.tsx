"use client";

import type { SeoPage } from "@/lib/db/schema";
import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { upsertSeoPageAction } from "../actions";
import { JSON_LD_TYPES, type JsonLdType } from "./jsonld-types";

export type { JsonLdType };

type RobotsValue = "" | "noindex,nofollow" | "noindex,follow";

type FormT = ReturnType<typeof useTranslations<"admin.seo.form">>;

function getRobotsOptions(t: FormT): {
  value: RobotsValue;
  label: string;
  hint: string;
}[] {
  return [
    {
      value: "",
      label: t("robotsDefaultLabel"),
      hint: t("robotsDefaultHint"),
    },
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
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              color: "var(--admin-accent)",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
            }}>
            {t("serpNoIndexBadge")}
          </span>
        )}
      </div>
      <p
        className="text-base font-medium truncate"
        style={{ color: "#1a0dab" }}>
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
        style={{
          background: "var(--admin-hover-bg)",
          color: "var(--admin-text-muted)",
        }}>
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
  name,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p style={labelStyle}>{label}</p>
          {hint && (
            <p style={{ ...hintStyle, marginTop: "0.125rem" }}>{hint}</p>
          )}
        </div>
        <input type="hidden" name={name} value={checked ? "true" : "false"} />
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out"
          style={{
            background: checked
              ? "var(--admin-accent)"
              : "var(--admin-input-border)",
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

// ─── Shared SeoForm ───────────────────────────────────────────────────────────
/**
 *
 * Props aggiuntive rispetto all'originale:
 * - `lockedPathname`: quando passato il campo pathname è bloccato (usato dal contenuto).
 * - `lockedLabel`: label pre-impostato e bloccato.
 * - `hidePathnameField`: nasconde completamente il selettore route (utile quando il pathname
 *   è già noto dal contenuto e non è necessario sceglierlo).
 */
export function SeoForm({
  page,
  domain,
  appName,
  unconfiguredRoutes,
  onClose,
  lockedPathname,
  lockedLabel,
  hidePathnameField = false,
}: {
  page?: SeoPage | null;
  domain: string;
  appName: string;
  unconfiguredRoutes: string[];
  onClose: () => void;
  lockedPathname?: string;
  lockedLabel?: string;
  hidePathnameField?: boolean;
}) {
  const t = useTranslations("admin.seo.form");
  const isEdit = !!page;
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
  const [state, action, isPending] = useActionState(upsertSeoPageAction, {});

  const [title, setTitle] = useState(page?.title ?? "");
  const [description, setDescription] = useState(page?.description ?? "");
  const [pathname, setPathname] = useState(
    lockedPathname ?? page?.pathname ?? "",
  );
  const [robots, setRobots] = useState<RobotsValue>(
    (page?.robots as RobotsValue) ?? "",
  );
  const [jsonLdEnabled, setJsonLdEnabled] = useState<boolean>(
    page?.jsonLdEnabled === true,
  );
  const [jsonLdType, setJsonLdType] = useState<JsonLdType | "">(
    (page?.jsonLdType as JsonLdType | null | undefined) ?? "",
  );

  useEffect(() => {
    if (state?.success) onClose();
  }, [state?.success, onClose]);

  function handleToggleJsonLd(enabled: boolean) {
    setJsonLdEnabled(enabled);
    if (enabled && !jsonLdType) setJsonLdType("WebPage");
  }

  const currentHint =
    jsonLdType && jsonLdType in jsonLdTypeHints
      ? jsonLdTypeHints[jsonLdType as JsonLdType]
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--admin-divider)" }}>
          <h2 className="font-semibold" style={{ color: "var(--admin-text)" }}>
            {isEdit ? t("titleEdit") : t("titleNew")}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--admin-text-faint)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--admin-hover-bg)";
              e.currentTarget.style.color = "var(--admin-text-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--admin-text-faint)";
            }}>
            <X size={18} />
          </button>
        </div>

        <form action={action} className="px-6 py-5 space-y-5">
          {isEdit && (
            <input
              type="hidden"
              name="originalPathname"
              value={page!.pathname}
            />
          )}

          {/* Pathname — nascosto se locked */}
          {lockedPathname ? (
            <>
              <input type="hidden" name="pathname" value={lockedPathname} />
              {!hidePathnameField && (
                <div className="space-y-1.5">
                  <label style={labelStyle}>{t("pathnameLabel")}</label>
                  <div
                    className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                    style={{
                      background: "var(--admin-hover-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text-muted)",
                    }}>
                    {lockedPathname}
                  </div>
                </div>
              )}
            </>
          ) : isEdit ? (
            <div className="space-y-1.5">
              <label style={labelStyle}>{t("pathnameLabel")}</label>
              <input type="hidden" name="pathname" value={page!.pathname} />
              <div
                className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                style={{
                  background: "var(--admin-hover-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text-muted)",
                }}>
                {page!.pathname}
              </div>
              <p style={hintStyle}>{t("pathnameLockedHint")}</p>
            </div>
          ) : unconfiguredRoutes.length > 0 ? (
            <div className="space-y-1.5">
              <label style={labelStyle}>{t("pathnameLabel")}</label>
              <select
                name="pathname"
                value={pathname}
                onChange={(e) => setPathname(e.target.value)}
                style={inputStyle}>
                <option value="">{t("pathnameSelectPlaceholder")}</option>
                {unconfiguredRoutes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2.5"
                style={{
                  background:
                    "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
                  border:
                    "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
                }}>
                <Info
                  size={13}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--admin-accent)" }}
                />
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t.rich("pathnameRoutesInfo", {
                    c: (chunks) => (
                      <code
                        className="font-mono px-1 py-0.5 rounded"
                        style={{
                          background: "var(--admin-hover-bg)",
                          color: "var(--admin-accent)",
                        }}>
                        {chunks}
                      </code>
                    ),
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background:
                  "color-mix(in srgb, #22c55e 8%, var(--admin-card-bg))",
                border:
                  "1px solid color-mix(in srgb, #22c55e 25%, transparent)",
              }}>
              <span style={{ color: "#22c55e" }}>✓</span>
              <p
                className="text-xs font-medium"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("pathnameAllConfigured")}
              </p>
            </div>
          )}

          {/* Label (uso interno) — nascosto se locked */}
          {lockedLabel ? (
            <input type="hidden" name="label" value={lockedLabel} />
          ) : (
            <div className="space-y-1.5">
              <label style={labelStyle}>{t("labelLabel")}</label>
              <input
                name="label"
                defaultValue={page?.label ?? ""}
                placeholder={t("labelPlaceholder")}
                style={inputStyle}
              />
            </div>
          )}

          {/* SERP preview */}
          <Serp
            title={resolvePreview(title, appName)}
            description={resolvePreview(description, appName)}
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
                    title.length === 0
                      ? "var(--admin-text-faint)"
                      : title.length > 60
                        ? "var(--admin-error, #ef4444)"
                        : title.length > 54
                          ? "var(--admin-warning, #d97706)"
                          : "var(--admin-success, #22c55e)",
                }}>
                {title.length}/60
              </span>
            </div>
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                    description.length === 0
                      ? "var(--admin-text-faint)"
                      : description.length > 155
                        ? "var(--admin-error, #ef4444)"
                        : description.length > 139
                          ? "var(--admin-warning, #d97706)"
                          : "var(--admin-success, #22c55e)",
                }}>
                {description.length}/155
              </span>
            </div>
            <textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder={t("metaDescriptionPlaceholder")}
              style={{ ...inputStyle, resize: "none" }}
            />
            <AppNameHint appName={appName} />
          </div>

          {/* Meta Robots */}
          <div className="space-y-1.5">
            <label style={labelStyle}>{t("robotsLabel")}</label>
            <select
              name="robots"
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

          {/* JSON-LD */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: "var(--admin-hover-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <Toggle
              name="jsonLdEnabled"
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
                {jsonLdEnabled && (
                  <input type="hidden" name="jsonLdType" value={jsonLdType} />
                )}
                <select
                  value={jsonLdType}
                  onChange={(e) => setJsonLdType(e.target.value as JsonLdType)}
                  style={inputStyle}>
                  <option value="" disabled>
                    {t("jsonLdTypePlaceholder")}
                  </option>
                  {JSON_LD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {currentHint && <p style={hintStyle}>{currentHint}</p>}
              </div>
            </div>
          </div>

          {/* Open Graph */}
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
                  name="ogTitle"
                  defaultValue={page?.ogTitle ?? ""}
                  maxLength={70}
                  placeholder={t("ogTitlePlaceholder")}
                  style={inputStyle}
                />
                <AppNameHint appName={appName} />
              </div>
              <div className="space-y-1.5">
                <label style={labelStyle}>{t("ogDescriptionLabel")}</label>
                <textarea
                  name="ogDescription"
                  defaultValue={page?.ogDescription ?? ""}
                  maxLength={200}
                  rows={2}
                  placeholder={t("ogDescriptionPlaceholder")}
                  style={{ ...inputStyle, resize: "none" }}
                />
                <AppNameHint appName={appName} />
              </div>
              <div className="space-y-1.5">
                <label style={labelStyle}>{t("ogImageLabel")}</label>
                <input
                  name="ogImage"
                  defaultValue={page?.ogImage ?? ""}
                  placeholder={t("ogImagePlaceholder")}
                  style={inputStyle}
                />
              </div>
            </div>
          </details>

          {state?.error && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{
                color: "var(--admin-error, #ef4444)",
                background:
                  "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
                border:
                  "1px solid color-mix(in srgb, #ef4444 20%, transparent)",
              }}>
              {state.error}
            </p>
          )}

          <div
            className="flex items-center justify-end gap-3 pt-2"
            style={{ borderTop: "1px solid var(--admin-divider)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
              style={{
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text-muted)",
                background: "transparent",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--admin-hover-bg)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }>
              {t("cancelButton")}
            </button>
            <button
              type="submit"
              disabled={
                isPending ||
                (!isEdit && !lockedPathname && unconfiguredRoutes.length === 0)
              }
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white font-medium transition-colors disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.filter = "brightness(0.9)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
              {isPending && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {isEdit ? t("submitEditButton") : t("submitNewButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
