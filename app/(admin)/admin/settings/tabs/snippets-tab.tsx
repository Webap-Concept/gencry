"use client";

import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type {
  SiteSnippet,
  SnippetPosition,
  SnippetType,
} from "@/lib/db/schema";
import {
  ChevronRight,
  Code2,
  Cookie,
  ExternalLink,
  FileCode2,
  Globe,
  GripVertical,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import {
  createSnippetAction,
  deleteSnippetAction,
  toggleSnippetAction,
  updateSnippetAction,
} from "../actions";

export type CookieServiceOption = {
  id: string;
  name: string;
  categoryId: string;
};

const CATEGORY_SHORT_KEYS: Record<
  string,
  "necessary" | "preferences" | "analytics" | "marketing"
> = {
  cookie_necessary: "necessary",
  cookie_preferences: "preferences",
  cookie_analytics: "analytics",
  cookie_marketing: "marketing",
};

// ---------------------------------------------------------------------------
// Costanti UI (puramente strutturali — i label sono i18n)
// ---------------------------------------------------------------------------
const TYPE_ICONS: Record<SnippetType, React.ReactNode> = {
  link_css: <Globe size={13} />,
  style: <FileCode2 size={13} />,
  script_src: <ExternalLink size={13} />,
  script: <Code2 size={13} />,
  raw: <FileCode2 size={13} />,
};

const TYPE_TKEY: Record<SnippetType, string> = {
  link_css: "linkCss",
  style: "style",
  script_src: "scriptSrc",
  script: "script",
  raw: "raw",
};

const POSITION_TKEY: Record<SnippetPosition, string> = {
  head: "head",
  body_end: "bodyEnd",
};

const CONTENT_PLACEHOLDER: Record<SnippetType, string> = {
  link_css: "https://fonts.bunny.net/css?family=...",
  style: "body { font-family: 'Inter', sans-serif; }",
  script_src: "https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX",
  script: "window.dataLayer = window.dataLayer || [];\nfunction gtag(){...}",
  raw: '<meta name="google-site-verification" content="..." />',
};

// ---------------------------------------------------------------------------
// Modelli predefiniti — la struttura tecnica è qui (id, icon, type, position,
// content), le label/descrizioni/step name vivono nel catalogo i18n sotto
// admin.settings.snippets.preset.list.<presetKey>.
// ---------------------------------------------------------------------------
type PresetStep = {
  /** Chiave i18n del nome dello step, sotto preset.list.<id>.step{N}Name */
  nameKey: "step1Name" | "step2Name";
  type: SnippetType;
  position: SnippetPosition;
  /** Contenuto con placeholder ${ID} / ${PIXEL_ID} / ecc. */
  content: string;
};

type Preset = {
  id: string;
  /** Chiave i18n sotto preset.list */
  tKey: string;
  paramPlaceholder: string;
  /** Icona testuale / emoji */
  icon: string;
  steps: PresetStep[];
  /**
   * Categoria cookie suggerita per questo tracker. Usata dal wizard per
   * pre-selezionare il primo servizio disponibile della stessa categoria
   * nel dropdown di gating del consenso. L'admin può sempre cambiare.
   * `null` = preset che non fa tracking (es. Search Console verification).
   */
  suggestedCategoryId: string | null;
};

const PRESETS: Preset[] = [
  {
    id: "ga4",
    tKey: "ga4",
    paramPlaceholder: "G-XXXXXXXXXX",
    icon: "📊",
    suggestedCategoryId: "cookie_analytics",
    steps: [
      {
        nameKey: "step1Name",
        type: "script_src",
        position: "head",
        content: "https://www.googletagmanager.com/gtag/js?id=${ID}",
      },
      {
        nameKey: "step2Name",
        type: "script",
        position: "head",
        content:
          "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${ID}');",
      },
    ],
  },
  {
    id: "gtm",
    tKey: "gtm",
    paramPlaceholder: "GTM-XXXXXXX",
    icon: "🏷️",
    // GTM è ambiguo (analytics + marketing): suggeriamo marketing che è la
    // categoria più conservativa (richiede opt-in esplicito) e copre il
    // caso più frequente (remarketing tags). L'admin può sempre cambiare.
    suggestedCategoryId: "cookie_marketing",
    steps: [
      {
        nameKey: "step1Name",
        type: "script",
        position: "head",
        content:
          "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${ID}');",
      },
      {
        nameKey: "step2Name",
        type: "raw",
        position: "body_end",
        content:
          '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
      },
    ],
  },
  {
    id: "meta_pixel",
    tKey: "metaPixel",
    paramPlaceholder: "1234567890123456",
    icon: "🎯",
    suggestedCategoryId: "cookie_marketing",
    steps: [
      {
        nameKey: "step1Name",
        type: "script",
        position: "head",
        content:
          "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', '${ID}');\nfbq('track', 'PageView');",
      },
      {
        nameKey: "step2Name",
        type: "raw",
        position: "head",
        content:
          '<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${ID}&ev=PageView&noscript=1" /></noscript>',
      },
    ],
  },
  {
    id: "search_console",
    tKey: "searchConsole",
    paramPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    icon: "🔍",
    // Solo un meta tag di verifica: niente cookie, niente tracking →
    // sempre attivo, nessun gating consenso.
    suggestedCategoryId: null,
    steps: [
      {
        nameKey: "step1Name",
        type: "raw",
        position: "head",
        content: '<meta name="google-site-verification" content="${ID}" />',
      },
    ],
  },
  {
    id: "hotjar",
    tKey: "hotjar",
    paramPlaceholder: "1234567",
    icon: "🔥",
    suggestedCategoryId: "cookie_analytics",
    steps: [
      {
        nameKey: "step1Name",
        type: "script",
        position: "head",
        content:
          "(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${ID},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Modale scelta modello
// ---------------------------------------------------------------------------
function PresetPicker({
  cookieServices,
  onPick,
  onCancel,
}: {
  cookieServices: CookieServiceOption[];
  onPick: (
    preset: Preset,
    paramValue: string,
    resolvedSteps: { name: string; type: SnippetType; position: SnippetPosition; content: string }[],
    cookieServiceId: string | null,
  ) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.settings.snippets");
  const tType = useTranslations("admin.settings.snippets.types");
  const tPosition = useTranslations("admin.settings.snippets.positions");
  const tPreset = useTranslations("admin.settings.snippets.preset");
  const tList = useTranslations("admin.settings.snippets.preset.list");
  const tForm = useTranslations("admin.settings.snippets.form");
  const [selected, setSelected] = useState<Preset | null>(null);
  const [paramValue, setParamValue] = useState("");
  const [cookieServiceId, setCookieServiceId] = useState<string>("");

  // Quando l'utente sceglie un preset, pre-seleziona il primo servizio
  // disponibile della categoria suggerita (es. ga4 → primo servizio della
  // categoria cookie_analytics). Se non c'è nulla in quella categoria
  // resta vuoto ("Always on") — l'admin sa che deve crearsi il servizio
  // corrispondente in /admin/compliance/cookies.
  function handlePresetSelect(preset: Preset) {
    setSelected(preset);
    if (preset.suggestedCategoryId) {
      const match = cookieServices.find(
        (s) => s.categoryId === preset.suggestedCategoryId,
      );
      setCookieServiceId(match?.id ?? "");
    } else {
      setCookieServiceId("");
    }
  }

  const fieldStyle = {
    width: "100%",
    padding: "8px 10px",
    fontSize: "13px",
    borderRadius: "8px",
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
    outline: "none",
  } as React.CSSProperties;

  return (
    <AdminDialog open onOpenChange={(o) => !o && onCancel()}>
      <AdminDialogContent
        icon={Wand2}
        size="lg"
        title={selected ? tList(`${selected.tKey}.label`) : tPreset("modalTitle")}>
        {!selected ? (
          /* Lista preset */
          <div className="space-y-1 -mx-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetSelect(p)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
                style={{ background: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--admin-hover-bg)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }>
                <span className="text-xl shrink-0">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--admin-text)" }}>
                    {tList(`${p.tKey}.label`)}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {tList(`${p.tKey}.description`)}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {tPreset("snippetCount", { count: p.steps.length })}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  style={{ color: "var(--admin-text-faint)", flexShrink: 0 }}
                />
              </button>
            ))}
          </div>
        ) : (
          /* Form parametro */
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {tList(`${selected.tKey}.description`)}
            </p>

            {/* Anteprima snippet che verranno creati */}
            <div className="space-y-1.5">
              <p
                className="text-xs font-medium"
                style={{ color: "var(--admin-text-muted)" }}>
                {tPreset("willCreate", { count: selected.steps.length })}
              </p>
              {selected.steps.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                  style={{
                    background:
                      "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
                    border:
                      "1px solid color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                  }}>
                  <span style={{ color: "var(--admin-accent)" }}>
                    {TYPE_ICONS[s.type]}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {tList(`${selected.tKey}.${s.nameKey}`)}
                  </span>
                  <span
                    className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background:
                        "color-mix(in srgb, var(--admin-text-faint) 12%, var(--admin-card-bg))",
                      color: "var(--admin-text-faint)",
                    }}>
                    {tPosition(POSITION_TKEY[s.position])}
                  </span>
                </div>
              ))}
            </div>

            {/* Input ID */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  marginBottom: "4px",
                  color: "var(--admin-text-muted)",
                }}>
                {tList(`${selected.tKey}.paramLabel`)}
              </label>
              <input
                value={paramValue}
                onChange={(e) => setParamValue(e.target.value)}
                placeholder={selected.paramPlaceholder}
                autoFocus
                style={fieldStyle}
              />
            </div>

            {/* Cookie service link — gating consent-aware nel wizard */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  marginBottom: "4px",
                  color: "var(--admin-text-muted)",
                }}>
                {tForm("cookieServiceLabel")}
              </label>
              <select
                value={cookieServiceId}
                onChange={(e) => setCookieServiceId(e.target.value)}
                style={fieldStyle}>
                <option value="">{tForm("cookieServiceNone")}</option>
                {cookieServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id})
                  </option>
                ))}
              </select>
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {cookieServiceId
                  ? tForm("cookieServiceHintLinked")
                  : selected.suggestedCategoryId
                    ? tPreset("cookieServiceMissingForCategory")
                    : tForm("cookieServiceHintNone")}
              </p>
            </div>

            <div
              className="flex items-center justify-end gap-2 pt-3"
              style={{ borderTop: "1px solid var(--admin-card-border)" }}>
              <AdminDialogCancelButton
                onClick={() => {
                  setSelected(null);
                  setParamValue("");
                  setCookieServiceId("");
                }}>
                {tPreset("backButton")}
              </AdminDialogCancelButton>
              <AdminDialogConfirmButton
                disabled={!paramValue.trim()}
                onClick={() => {
                  const resolvedSteps = selected.steps.map((s) => ({
                    name: tList(`${selected.tKey}.${s.nameKey}`),
                    type: s.type,
                    position: s.position,
                    content: s.content,
                  }));
                  onPick(
                    selected,
                    paramValue.trim(),
                    resolvedSteps,
                    cookieServiceId || null,
                  );
                }}
                icon={Save}>
                {tPreset("confirmButton")}
              </AdminDialogConfirmButton>
            </div>
          </div>
        )}
      </AdminDialogContent>
    </AdminDialog>
  );
}

// ---------------------------------------------------------------------------
// Form modale (crea / modifica singolo snippet)
// ---------------------------------------------------------------------------
function SnippetForm({
  initial,
  cookieServices,
  onSave,
  onCancel,
  loading,
  error,
}: {
  initial?: Partial<SiteSnippet>;
  cookieServices: CookieServiceOption[];
  onSave: (data: Omit<SiteSnippet, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  loading: boolean;
  error?: string | null;
}) {
  const t = useTranslations("admin.settings.snippets.form");
  const tType = useTranslations("admin.settings.snippets.types");
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<SnippetType>(
    (initial?.type as SnippetType) ?? "script",
  );
  const [position, setPosition] = useState<SnippetPosition>(
    (initial?.position as SnippetPosition) ?? "head",
  );
  const [content, setContent] = useState(initial?.content ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [cookieServiceId, setCookieServiceId] = useState<string>(
    initial?.cookieServiceId ?? "",
  );

  const isUrl = type === "link_css" || type === "script_src";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    onSave({
      name,
      type,
      position,
      content,
      isActive,
      sortOrder: initial?.sortOrder ?? 0,
      cookieServiceId: cookieServiceId || null,
    });
  }

  const fieldStyle = {
    width: "100%",
    padding: "8px 10px",
    fontSize: "13px",
    borderRadius: "8px",
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
    outline: "none",
  } as React.CSSProperties;

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: 500,
    marginBottom: "4px",
    color: "var(--admin-text-muted)",
  } as React.CSSProperties;

  return (
    <AdminDialog open onOpenChange={(o) => !o && onCancel()}>
      <AdminDialogContent
        icon={Code2}
        size="lg"
        title={initial?.id ? t("titleEdit") : t("titleNew")}>
        <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nome */}
        <div>
          <label style={labelStyle}>{t("nameLabel")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            required
            style={fieldStyle}
          />
        </div>

        {/* Tipo + Posizione */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>{t("typeLabel")}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SnippetType)}
              style={fieldStyle}>
              {(Object.keys(TYPE_TKEY) as SnippetType[]).map((k) => (
                <option key={k} value={k}>
                  {tType(TYPE_TKEY[k])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("positionLabel")}</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as SnippetPosition)}
              style={fieldStyle}>
              <option value="head">&lt;head&gt;</option>
              <option value="body_end">{`Fine <body>`}</option>
            </select>
          </div>
        </div>

        {/* Contenuto */}
        <div>
          <label style={labelStyle}>{isUrl ? t("urlLabel") : t("contentLabel")}</label>
          {isUrl ? (
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={CONTENT_PLACEHOLDER[type]}
              required
              style={fieldStyle}
            />
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={CONTENT_PLACEHOLDER[type]}
              required
              rows={6}
              style={{
                ...fieldStyle,
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            />
          )}
        </div>

        {/* Attivo — pill toggle identico al resto dell'admin */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive((v) => !v)}
            style={{
              position: "relative",
              width: 44,
              height: 24,
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 160ms ease",
              background: isActive
                ? "var(--admin-accent)"
                : "var(--admin-input-border, #3a3937)",
            }}>
            <span
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                transition: "transform 160ms cubic-bezier(0.16,1,0.3,1)",
                transform: isActive ? "translateX(20px)" : "translateX(0)",
              }}
            />
          </button>
          <span
            className="text-sm"
            style={{ color: "var(--admin-text-muted)" }}>
            {isActive ? t("activeOn") : t("activeOff")}
          </span>
        </div>

        {/* Cookie service link — gating consent-aware */}
        <div>
          <label style={labelStyle}>{t("cookieServiceLabel")}</label>
          <select
            value={cookieServiceId}
            onChange={(e) => setCookieServiceId(e.target.value)}
            style={fieldStyle}>
            <option value="">{t("cookieServiceNone")}</option>
            {cookieServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {cookieServiceId ? t("cookieServiceHintLinked") : t("cookieServiceHintNone")}
          </p>
        </div>

        {error && (
          <p
            className="text-xs rounded-lg px-3 py-2"
            style={{
              color: "#ef4444",
              background: "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
              border: "1px solid color-mix(in srgb, #ef4444 22%, transparent)",
            }}>
            {error}
          </p>
        )}

        {/* Bottoni */}
        <div
          className="flex items-center justify-end gap-2 pt-3"
          style={{ borderTop: "1px solid var(--admin-card-border)" }}>
          <AdminDialogCancelButton onClick={onCancel}>
            {t("cancelButton")}
          </AdminDialogCancelButton>
          <AdminDialogConfirmButton
            type="submit"
            loading={loading}
            disabled={loading}
            icon={Save}>
            {loading ? t("savingButton") : t("saveButton")}
          </AdminDialogConfirmButton>
        </div>
        </form>
      </AdminDialogContent>
    </AdminDialog>
  );
}

// ---------------------------------------------------------------------------
// Riga snippet
// ---------------------------------------------------------------------------
function SnippetRow({
  snippet,
  cookieServices,
  onEdit,
  onDelete,
  onToggle,
  pendingId,
}: {
  snippet: SiteSnippet;
  cookieServices: CookieServiceOption[];
  onEdit: (s: SiteSnippet) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, current: boolean) => void;
  pendingId: number | null;
}) {
  const t = useTranslations("admin.settings.snippets");
  const tType = useTranslations("admin.settings.snippets.types");
  const tPosition = useTranslations("admin.settings.snippets.positions");
  const tCat = useTranslations("public.cookieModal");
  const adminSlug = useAdminSlug();
  const cookiesHref = buildAdminPathFromSlug(adminSlug, getAdminRelPath("compliance-cookies"));
  const isPending = pendingId === snippet.id;
  const type = snippet.type as SnippetType;
  const position = snippet.position as SnippetPosition;
  const previewContent =
    snippet.content.length > 60
      ? snippet.content.slice(0, 60) + "…"
      : snippet.content;

  // Risolvi il cookie service collegato (se c'è) per mostrare il badge consenso.
  const linkedService = snippet.cookieServiceId
    ? cookieServices.find((s) => s.id === snippet.cookieServiceId)
    : null;
  // Snippet linkato a un servizio cancellato (FK SET NULL non scatta finché
  // il record esiste; ma se l'admin ha cancellato il servizio l'option non
  // c'è più nella lista). Mostra warning per dare visibilità all'orfano.
  const linkOrphan =
    snippet.cookieServiceId !== null && snippet.cookieServiceId !== undefined && !linkedService;
  const categoryShort = linkedService
    ? CATEGORY_SHORT_KEYS[linkedService.categoryId]
    : null;
  const categoryLabel = categoryShort ? tCat(`categories.${categoryShort}.label`) : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        opacity: isPending ? 0.6 : snippet.isActive ? 1 : 0.55,
        transition: "opacity 160ms ease",
      }}>
      <GripVertical
        size={14}
        style={{
          color: "var(--admin-text-faint)",
          flexShrink: 0,
          cursor: "grab",
        }}
      />
      <span style={{ color: "var(--admin-accent)", flexShrink: 0 }}>
        {TYPE_ICONS[type]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {snippet.name}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 10%, var(--admin-card-bg))",
              color: "var(--admin-accent)",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
            }}>
            {tType(TYPE_TKEY[type])}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              background:
                "color-mix(in srgb, var(--admin-text-faint) 12%, var(--admin-card-bg))",
              color: "var(--admin-text-muted)",
              border:
                "1px solid color-mix(in srgb, var(--admin-text-faint) 20%, transparent)",
            }}>
            {tPosition(POSITION_TKEY[position])}
          </span>
          {!snippet.isActive && (
            <span
              className="text-xs"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("rowInactiveBadge")}
            </span>
          )}
          {linkedService && categoryLabel && (
            <Link
              href={cookiesHref}
              title={t("rowConsentBadgeTooltip", {
                service: linkedService.name,
                category: categoryLabel,
              })}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full hover:underline"
              style={{
                background: "color-mix(in srgb, #10b981 12%, var(--admin-card-bg))",
                color: "#10b981",
                border: "1px solid color-mix(in srgb, #10b981 25%, transparent)",
              }}>
              <ShieldCheck size={11} />
              {categoryLabel}
            </Link>
          )}
          {linkOrphan && (
            <Link
              href={cookiesHref}
              title={t("rowConsentOrphanTooltip")}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full hover:underline"
              style={{
                background: "color-mix(in srgb, #f59e0b 12%, var(--admin-card-bg))",
                color: "#f59e0b",
                border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
              }}>
              <Cookie size={11} />
              {t("rowConsentOrphanBadge")}
            </Link>
          )}
          {!snippet.cookieServiceId && (
            <span
              title={t("rowAlwaysOnTooltip")}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
              style={{
                background: "color-mix(in srgb, var(--admin-text-faint) 10%, var(--admin-card-bg))",
                color: "var(--admin-text-muted)",
                border: "1px solid color-mix(in srgb, var(--admin-text-faint) 18%, transparent)",
              }}>
              {t("rowAlwaysOnBadge")}
            </span>
          )}
        </div>
        <p
          className="text-xs font-mono mt-0.5 truncate"
          style={{ color: "var(--admin-text-faint)" }}>
          {previewContent}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {/* Toggle pill — identico al resto dell'admin */}
        <button
          onClick={() => onToggle(snippet.id, snippet.isActive)}
          disabled={isPending}
          role="switch"
          aria-checked={snippet.isActive}
          title={snippet.isActive ? t("rowDeactivateTitle") : t("rowActivateTitle")}
          style={{
            position: "relative",
            width: 36,
            height: 20,
            borderRadius: 9999,
            border: "none",
            cursor: isPending ? "not-allowed" : "pointer",
            flexShrink: 0,
            transition: "background 160ms ease",
            background: snippet.isActive
              ? "var(--admin-accent)"
              : "var(--admin-input-border, #3a3937)",
            opacity: isPending ? 0.5 : 1,
          }}>
          <span
            style={{
              position: "absolute",
              top: 2,
              left: 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
              transition: "transform 160ms cubic-bezier(0.16,1,0.3,1)",
              transform: snippet.isActive
                ? "translateX(16px)"
                : "translateX(0)",
            }}
          />
        </button>
        <button
          onClick={() => onEdit(snippet)}
          title={t("rowEditTitle")}
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
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(snippet.id)}
          title={t("rowDeleteTitle")}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--admin-text-faint)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))";
            e.currentTarget.style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--admin-text-faint)";
          }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab principale
// ---------------------------------------------------------------------------
export function SnippetsTab({
  initialSnippets,
  cookieServices,
}: {
  initialSnippets: SiteSnippet[];
  cookieServices: CookieServiceOption[];
}) {
  const t = useTranslations("admin.settings.snippets");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [snippets, setSnippets] = useOptimistic(initialSnippets);
  const [editTarget, setEditTarget] = useState<SiteSnippet | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleSave(
    data: Omit<SiteSnippet, "id" | "createdAt" | "updatedAt">,
  ) {
    setFormLoading(true);
    setFormError(null);
    try {
      if (editTarget) {
        await updateSnippetAction(editTarget.id, data);
      } else {
        await createSnippetAction(data);
      }
      setShowForm(false);
      setEditTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      // Causa più frequente in dev: la migration 0042 non è stata ancora
      // applicata e la colonna cookie_service_id non esiste. Mostriamo
      // l'errore inline invece di lasciare il modal in spinner infinito.
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setFormLoading(false);
    }
  }

  async function handlePresetPick(
    preset: Preset,
    paramValue: string,
    resolvedSteps: { name: string; type: SnippetType; position: SnippetPosition; content: string }[],
    cookieServiceId: string | null,
  ) {
    setShowPresets(false);
    setFormLoading(true);
    // Tutti gli snippet del preset condividono lo stesso cookieServiceId:
    // di solito un tracker (es. GA4) ha 2 snippet che lavorano insieme,
    // quindi devono caricare/non-caricare insieme col consenso.
    for (const step of resolvedSteps) {
      const content = step.content.replaceAll("${ID}", paramValue);
      await createSnippetAction({
        name: step.name,
        type: step.type,
        position: step.position,
        content,
        isActive: true,
        sortOrder: 0,
        cookieServiceId,
      });
    }
    setFormLoading(false);
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    const snippet = snippets.find((s) => s.id === id);
    setConfirmDelete({
      id,
      name: snippet?.name ?? t("deleteConfirmFallbackName"),
    });
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleteLoading(true);
    setPendingId(confirmDelete.id);
    await deleteSnippetAction(confirmDelete.id);
    setDeleteLoading(false);
    setConfirmDelete(null);
    setPendingId(null);
    startTransition(() => router.refresh());
  }

  async function handleToggle(id: number, current: boolean) {
    setPendingId(id);
    setSnippets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !current } : s)),
    );
    await toggleSnippetAction(id, !current);
    setPendingId(null);
    startTransition(() => router.refresh());
  }

  const headSnippets = snippets.filter((s) => s.position === "head");
  const bodySnippets = snippets.filter((s) => s.position === "body_end");

  function SectionTitle({ label, count }: { label: string; count: number }) {
    return (
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--admin-text-muted)" }}>
          {label}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{
            background:
              "color-mix(in srgb, var(--admin-text-faint) 12%, var(--admin-card-bg))",
            color: "var(--admin-text-faint)",
          }}>
          {count}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {t("title")}
          </h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Modelli predefiniti */}
          <button
            onClick={() => setShowPresets(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{
              background: "var(--admin-input-bg)",
              border: "1px solid var(--admin-border)",
              color: "var(--admin-text-muted)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--admin-hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--admin-input-bg)")
            }>
            <Wand2 size={13} /> {t("presetsButton")}
          </button>
          {/* Aggiungi manuale */}
          <button
            onClick={() => {
              setEditTarget(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.filter = "brightness(0.88)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
            <Plus size={13} /> {t("addButton")}
          </button>
        </div>
      </div>

      {/* Lista head */}
      {headSnippets.length > 0 && (
        <div>
          <SectionTitle label={t("sectionHead")} count={headSnippets.length} />
          <div className="space-y-2">
            {headSnippets.map((s) => (
              <SnippetRow
                key={s.id}
                snippet={s}
                cookieServices={cookieServices}
                onEdit={(s) => {
                  setEditTarget(s);
                  setShowForm(true);
                }}
                onDelete={handleDelete}
                onToggle={handleToggle}
                pendingId={pendingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lista body_end */}
      {bodySnippets.length > 0 && (
        <div>
          <SectionTitle label={t("sectionBodyEnd")} count={bodySnippets.length} />
          <div className="space-y-2">
            {bodySnippets.map((s) => (
              <SnippetRow
                key={s.id}
                snippet={s}
                cookieServices={cookieServices}
                onEdit={(s) => {
                  setEditTarget(s);
                  setShowForm(true);
                }}
                onDelete={handleDelete}
                onToggle={handleToggle}
                pendingId={pendingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {snippets.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-2xl"
          style={{
            border: "1px dashed var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}>
          <Code2 size={28} style={{ marginBottom: "0.75rem", opacity: 0.4 }} />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("emptyTitle")}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("emptyDescription")}
          </p>
        </div>
      )}

      {/* ConfirmModal eliminazione */}
      <ConfirmModal
        open={!!confirmDelete}
        title={t("deleteConfirmTitle")}
        message={
          <>
            {t.rich("deleteConfirmMessage", {
              name: () => (
                <strong style={{ color: "var(--admin-text)" }}>
                  {confirmDelete?.name}
                </strong>
              ),
            })}
            <br />
            {t("deleteConfirmIrreversible")}
          </>
        }
        confirmLabel={t("deleteConfirmLabel")}
        variant="danger"
        loading={deleteLoading}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {showForm && (
        <SnippetForm
          initial={editTarget ?? undefined}
          cookieServices={cookieServices}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditTarget(null);
            setFormError(null);
          }}
          loading={formLoading}
          error={formError}
        />
      )}

      {showPresets && (
        <PresetPicker
          cookieServices={cookieServices}
          onPick={handlePresetPick}
          onCancel={() => setShowPresets(false)}
        />
      )}
    </div>
  );
}
