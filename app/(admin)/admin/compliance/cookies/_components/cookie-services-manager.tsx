"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import type {
  CookieCategory,
  CookieService,
  CookieServiceTranslation,
} from "@/lib/db/schema";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  Globe,
  Lock,
  Megaphone,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import {
  deleteCookieServiceAction,
  saveCookieServiceAction,
  toggleCookieServiceEnabledAction,
  type ActionState,
} from "../actions";

type LocaleOption = { code: string; nativeLabel: string };

type Registry = {
  categories: CookieCategory[];
  services: CookieService[];
  translations: CookieServiceTranslation[];
};

type ModalMode = { kind: "add"; categoryId: string } | { kind: "edit"; service: CookieService };

/**
 * Mappa categoryId DB → shortKey usata nelle keys i18n
 * `public.cookieModal.categories.<shortKey>.{label,description}`. Le 4
 * categorie ePrivacy hanno label tradotte già nel banner pubblico —
 * riusiamo le stesse chiavi anche qui in admin per non duplicare.
 * Le categorie custom future cadranno sul fallback all'id.
 */
const CATEGORY_SHORT_KEYS: Record<string, "necessary" | "preferences" | "analytics" | "marketing"> = {
  cookie_necessary: "necessary",
  cookie_preferences: "preferences",
  cookie_analytics: "analytics",
  cookie_marketing: "marketing",
};

/**
 * Icona per ciascuna delle 4 categorie ePrivacy. Categorie custom future
 * cadono sul fallback Lock (nessuna icona specifica registrata).
 */
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  cookie_necessary: ShieldCheck,
  cookie_preferences: SlidersHorizontal,
  cookie_analytics: BarChart3,
  cookie_marketing: Megaphone,
};

export function CookieServicesManager({
  registry,
  locales,
  bannerEnabled,
  snippetCounts,
}: {
  registry: Registry;
  locales: LocaleOption[];
  bannerEnabled: boolean;
  /** serviceId → numero di snippet collegati (qualsiasi stato). */
  snippetCounts: Record<string, number>;
}) {
  const t = useTranslations("admin.compliance.cookies");
  const tCat = useTranslations("public.cookieModal");

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CookieService | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function categoryLabel(id: string): string {
    const short = CATEGORY_SHORT_KEYS[id];
    return short ? tCat(`categories.${short}.label`) : id;
  }
  function categoryDescription(id: string): string {
    const short = CATEGORY_SHORT_KEYS[id];
    return short ? tCat(`categories.${short}.description`) : "";
  }

  function statusOf(cat: CookieCategory): "always_on" | "blocked" | "user_choice" {
    if (cat.alwaysOn) return "always_on";
    if (!bannerEnabled) return "blocked";
    return "user_choice";
  }

  function handleToggle(service: CookieService, next: boolean) {
    setTogglingId(service.id);
    setToggleError(null);
    startTransition(async () => {
      const res = await toggleCookieServiceEnabledAction(service.id, next);
      if ("error" in res) setToggleError(res.error);
      setTogglingId(null);
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await deleteCookieServiceAction(deleteTarget.id);
    if ("error" in res) setDeleteError(res.error);
    setDeleteLoading(false);
    setDeleteTarget(null);
  }

  // Resolver per la traduzione di un singolo servizio in un singolo locale
  function tr(serviceId: string, locale: string) {
    return registry.translations.find(
      (t) => t.serviceId === serviceId && t.locale === locale,
    );
  }

  return (
    <>
      <ConfirmModal
        open={deleteTarget !== null}
        title={t("services.deleteModalTitle")}
        message={
          <>
            {t("services.deleteModalIntroBefore")}{" "}
            <strong>{tr(deleteTarget?.id ?? "", DEFAULT_LOCALE)?.name ?? deleteTarget?.id}</strong>
            {t("services.deleteModalIntroAfter")}
            <br />
            <span style={{ marginTop: "6px", display: "block" }}>
              {t("services.deleteModalIrreversible")}
            </span>
          </>
        }
        variant="danger"
        confirmLabel={t("services.deleteModalConfirm")}
        cancelLabel={t("services.deleteModalCancel")}
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {(toggleError || deleteError) && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-sm"
          style={{
            background: "color-mix(in srgb, #ef4444 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #ef4444 25%, transparent)",
            color: "#ef4444",
          }}>
          {toggleError || deleteError}
        </div>
      )}

      <div className="space-y-4">
        {registry.categories.map((cat) => {
          const services = registry.services.filter((s) => s.categoryId === cat.id);
          const Icon = CATEGORY_ICONS[cat.id] ?? Lock;
          return (
            <CategoryCard
              key={cat.id}
              category={cat}
              services={services}
              status={statusOf(cat)}
              label={categoryLabel(cat.id)}
              description={categoryDescription(cat.id)}
              icon={Icon}
              tr={tr}
              togglingId={togglingId}
              snippetCounts={snippetCounts}
              onToggle={handleToggle}
              onAddService={() => setModalMode({ kind: "add", categoryId: cat.id })}
              onEditService={(s) => setModalMode({ kind: "edit", service: s })}
              onDeleteService={(s) => setDeleteTarget(s)}
            />
          );
        })}
      </div>

      {modalMode && (
        <ServiceModal
          mode={modalMode}
          registry={registry}
          locales={locales}
          tr={tr}
          onClose={() => setModalMode(null)}
        />
      )}
    </>
  );
}

// ─── CategoryCard ────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  services,
  status,
  label,
  description,
  icon: Icon,
  tr,
  togglingId,
  snippetCounts,
  onToggle,
  onAddService,
  onEditService,
  onDeleteService,
}: {
  category: CookieCategory;
  services: CookieService[];
  status: "always_on" | "blocked" | "user_choice";
  label: string;
  description: string;
  icon: React.ElementType;
  tr: (serviceId: string, locale: string) => CookieServiceTranslation | undefined;
  togglingId: string | null;
  snippetCounts: Record<string, number>;
  onToggle: (s: CookieService, next: boolean) => void;
  onAddService: () => void;
  onEditService: (s: CookieService) => void;
  onDeleteService: (s: CookieService) => void;
}) {
  const t = useTranslations("admin.compliance.cookies");

  const badge = (() => {
    if (status === "always_on") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-medium text-slate-800">
          {t("categoryCard.badgeAlwaysOn")}
        </span>
      );
    }
    if (status === "blocked") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-medium text-rose-800">
          {t("categoryCard.badgeBlocked")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800">
        {t("categoryCard.badgeUserChoice")}
      </span>
    );
  })();

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div
        className="flex flex-wrap items-start justify-between gap-3 p-5"
        style={{ borderBottom: "1px solid var(--admin-card-border)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon
              size={15}
              style={{ color: "var(--admin-accent)", flexShrink: 0 }}
            />
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              {label}
            </h3>
            {badge}
          </div>
          {description && (
            <p className="text-[12px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
              {description}
            </p>
          )}
          <p
            className="text-[10.5px] mt-1 font-mono"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("categoryCard.consentTypeLabel", { id: category.id })}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddService}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0 transition-colors"
          style={{ background: "var(--admin-accent)" }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.92)")}
          onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
          <Plus size={13} /> {t("services.addButton")}
        </button>
      </div>

      {services.length === 0 ? (
        <div
          className="px-5 py-4 text-[12px]"
          style={{ color: "var(--admin-text-faint)" }}>
          {t("categoryCard.noServices")}
        </div>
      ) : (
        <ul>
          {services.map((s, idx) => {
            const trDefault = tr(s.id, DEFAULT_LOCALE);
            const displayName = trDefault?.name ?? s.id;
            const displayDesc = trDefault?.description ?? "";
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                style={
                  idx > 0 ? { borderTop: "1px solid var(--admin-card-border)" } : undefined
                }>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium" style={{ color: "var(--admin-text)" }}>
                      {displayName}
                    </span>
                    {!s.enabled && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        {t("services.disabledBadge")}
                      </span>
                    )}
                    {s.firstParty ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        <Building2 size={10} /> {t("categoryCard.firstParty")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                        <Globe size={10} /> {t("categoryCard.thirdParty")}
                      </span>
                    )}
                    {s.isSystem && (
                      <span
                        title={t("services.systemTooltip")}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        <Lock size={10} /> {t("services.systemBadge")}
                      </span>
                    )}
                    <SnippetStatusBadge
                      requiresSnippet={s.requiresSnippet}
                      count={snippetCounts[s.id] ?? 0}
                    />
                  </div>
                  {displayDesc && (
                    <p className="text-[11.5px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                      {displayDesc}
                    </p>
                  )}
                  {s.provider && (
                    <p className="text-[10.5px] mt-1" style={{ color: "var(--admin-text-muted)" }}>
                      {t("categoryCard.providerLabel")} {s.provider}
                      {s.providerPolicyUrl && (
                        <>
                          {" — "}
                          <a
                            href={s.providerPolicyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 underline">
                            {t("categoryCard.providerPolicyLink")}
                            <ExternalLink size={9} />
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <ToggleSwitch
                    checked={s.enabled}
                    disabled={togglingId === s.id}
                    onChange={(next) => onToggle(s, next)}
                    ariaLabel={t("services.toggleAria")}
                  />
                  <button
                    type="button"
                    onClick={() => onEditService(s)}
                    title={t("services.editTooltip")}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: "var(--admin-text-muted)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--admin-accent)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--admin-text-muted)")
                    }>
                    <Pencil size={13} />
                  </button>
                  {!s.isSystem && (
                    <button
                      type="button"
                      onClick={() => onDeleteService(s)}
                      title={t("services.deleteTooltip")}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: "var(--admin-text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--admin-text-muted)")
                      }>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── SnippetStatusBadge ──────────────────────────────────────────────────────
//
// Sintetizza in un badge il legame fra il servizio cookie e gli eventuali
// snippet configurati in /admin/settings/snippets:
//   - requiresSnippet=false → "N/A": il servizio non ha bisogno di uno
//     snippet (es. cookie tecnici, script hardcoded come Vercel Analytics).
//     Niente badge per non rumoreggiare l'UI.
//   - requiresSnippet=true && count===0 → giallo "Snippet missing":
//     l'admin ha dichiarato il cookie ma nessun script lo carica davvero.
//   - requiresSnippet=true && count>0 → verde "Snippet configured (N)":
//     pronto, lo snippet è collegato e verrà caricato col consenso.

function SnippetStatusBadge({
  requiresSnippet,
  count,
}: {
  requiresSnippet: boolean;
  count: number;
}) {
  const t = useTranslations("admin.compliance.cookies.snippetStatus");
  if (!requiresSnippet) return null;
  if (count === 0) {
    return (
      <Link
        href="/admin/settings/snippets"
        title={t("missingTooltip")}
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:underline">
        <AlertTriangle size={10} /> {t("missingBadge")}
      </Link>
    );
  }
  return (
    <Link
      href="/admin/settings/snippets"
      title={t("configuredTooltip", { count })}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 hover:underline">
      <CheckCircle2 size={10} /> {t("configuredBadge", { count })}
    </Link>
  );
}

// ─── ToggleSwitch (riusabile inline) ─────────────────────────────────────────

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50"
      style={{
        background: checked ? "var(--admin-accent)" : "var(--admin-input-border)",
      }}>
      <span
        aria-hidden="true"
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200"
        style={{
          background: "white",
          transform: checked ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

// ─── ServiceModal (add / edit) ───────────────────────────────────────────────

function ServiceModal({
  mode,
  registry,
  locales,
  tr,
  onClose,
}: {
  mode: ModalMode;
  registry: Registry;
  locales: LocaleOption[];
  tr: (serviceId: string, locale: string) => CookieServiceTranslation | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("admin.compliance.cookies");
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    saveCookieServiceAction,
    {},
  );

  useEffect(() => {
    if ("success" in state) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isEdit = mode.kind === "edit";
  const editing = isEdit ? mode.service : null;
  const defaultCategoryId = isEdit ? editing!.categoryId : mode.categoryId;
  const isSystemService = isEdit ? editing!.isSystem : false;

  // Stato form (controlled)
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [enabled, setEnabled] = useState(isEdit ? editing!.enabled : true);
  const [firstParty, setFirstParty] = useState(isEdit ? editing!.firstParty : false);
  const [provider, setProvider] = useState(isEdit ? editing!.provider ?? "" : "");
  const [providerPolicyUrl, setProviderPolicyUrl] = useState(
    isEdit ? editing!.providerPolicyUrl ?? "" : "",
  );
  // Default true: il caso comune è "ho aggiunto un tracker third-party,
  // mi serve uno snippet per caricarlo". Solo i system/hardcoded sono false.
  const [requiresSnippet, setRequiresSnippet] = useState(
    isEdit ? editing!.requiresSnippet : true,
  );
  const [sortOrder, setSortOrder] = useState(String(isEdit ? editing!.sortOrder : 0));
  const [idNew, setIdNew] = useState("");

  // Traduzioni: { [locale]: { name, description } }
  type TrField = { name: string; description: string };
  const initialTrFields: Record<string, TrField> = {};
  if (isEdit) {
    for (const loc of locales) {
      const existing = tr(editing!.id, loc.code);
      initialTrFields[loc.code] = {
        name: existing?.name ?? "",
        description: existing?.description ?? "",
      };
    }
  } else {
    for (const loc of locales) initialTrFields[loc.code] = { name: "", description: "" };
  }
  const [trFields, setTrFields] = useState<Record<string, TrField>>(initialTrFields);
  const [activeLang, setActiveLang] = useState<string>(DEFAULT_LOCALE);

  function updateTrField(locale: string, key: keyof TrField, val: string) {
    setTrFields((prev) => ({
      ...prev,
      [locale]: { ...(prev[locale] ?? { name: "", description: "" }), [key]: val },
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--admin-divider)" }}>
          <h2 className="font-semibold" style={{ color: "var(--admin-text)" }}>
            {isEdit ? t("services.modalEditTitle") : t("services.modalAddTitle")}
          </h2>
          <button onClick={onClose} className="p-1 rounded">
            <X size={18} style={{ color: "var(--admin-text-muted)" }} />
          </button>
        </div>

        <form action={action} className="px-6 py-5 space-y-4">
          {isEdit && <input type="hidden" name="id" value={editing!.id} />}
          <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
          <input type="hidden" name="firstParty" value={firstParty ? "true" : "false"} />
          <input
            type="hidden"
            name="requiresSnippet"
            value={requiresSnippet ? "true" : "false"}
          />
          {/* Hidden inputs traduzioni — pattern uguale a page-editor */}
          {locales.map((loc) => (
            <Fragment key={loc.code}>
              <input
                type="hidden"
                name={`tr_${loc.code}_name`}
                value={trFields[loc.code]?.name ?? ""}
                readOnly
              />
              <input
                type="hidden"
                name={`tr_${loc.code}_description`}
                value={trFields[loc.code]?.description ?? ""}
                readOnly
              />
            </Fragment>
          ))}

          {/* ID (solo in add) */}
          {isEdit ? (
            <div>
              <Label>{t("services.fieldId")}</Label>
              <div
                className="rounded-lg px-3 py-2 text-sm font-mono"
                style={{
                  background: "var(--admin-hover-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text-muted)",
                }}>
                {editing!.id}
                {isSystemService && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                    <Lock size={10} /> {t("services.systemBadge")}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <Label>{t("services.fieldId")}</Label>
              <input
                name="idNew"
                value={idNew}
                onChange={(e) => setIdNew(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="meta_pixel"
                required
                className="w-full text-sm rounded-lg px-3 py-2 font-mono"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
                {t("services.fieldIdHint")}
              </p>
            </div>
          )}

          {/* Categoria + Sort + toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("services.fieldCategory")}</Label>
              <select
                name="categoryId"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isSystemService}
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                  cursor: isSystemService ? "not-allowed" : undefined,
                  opacity: isSystemService ? 0.7 : 1,
                }}>
                {registry.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("services.fieldSortOrder")}</Label>
              <input
                name="sortOrder"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--admin-text)" }}>
              <ToggleSwitch
                checked={enabled}
                onChange={setEnabled}
                ariaLabel={t("services.fieldEnabled")}
              />
              {t("services.fieldEnabled")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--admin-text)" }}>
              <ToggleSwitch
                checked={firstParty}
                onChange={setFirstParty}
                ariaLabel={t("services.fieldFirstParty")}
              />
              {t("services.fieldFirstParty")}
            </label>
            <label
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: "var(--admin-text)" }}
              title={t("services.fieldRequiresSnippetHint")}>
              <ToggleSwitch
                checked={requiresSnippet}
                onChange={setRequiresSnippet}
                ariaLabel={t("services.fieldRequiresSnippet")}
              />
              {t("services.fieldRequiresSnippet")}
            </label>
          </div>

          {/* Provider info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("services.fieldProvider")}</Label>
              <input
                name="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Meta Platforms Inc."
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
            </div>
            <div>
              <Label>{t("services.fieldProviderPolicyUrl")}</Label>
              <input
                name="providerPolicyUrl"
                value={providerPolicyUrl}
                onChange={(e) => setProviderPolicyUrl(e.target.value)}
                placeholder="https://www.facebook.com/privacy/policy"
                className="w-full text-sm rounded-lg px-3 py-2"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
            </div>
          </div>

          {/* Lang tabs per nome+description */}
          {locales.length > 0 && (
            <div
              className="rounded-xl"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
              }}>
              <div
                className="flex items-center gap-1 px-3 pt-2 pb-0"
                style={{ borderBottom: "1px solid var(--admin-divider)" }}>
                {locales.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setActiveLang(l.code)}
                    className="relative px-3 py-2 text-xs font-semibold tracking-wide transition-colors"
                    style={{
                      color: activeLang === l.code ? "var(--admin-accent)" : "var(--admin-text-muted)",
                      borderBottom:
                        activeLang === l.code
                          ? "2px solid var(--admin-accent)"
                          : "2px solid transparent",
                      marginBottom: "-1px",
                    }}>
                    {l.code.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="p-3 space-y-3">
                <div>
                  <Label>{t("services.fieldName")}</Label>
                  <input
                    value={trFields[activeLang]?.name ?? ""}
                    onChange={(e) => updateTrField(activeLang, "name", e.target.value)}
                    placeholder="Meta Pixel"
                    className="w-full text-sm rounded-lg px-3 py-2"
                    style={{
                      background: "var(--admin-card-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                </div>
                <div>
                  <Label>{t("services.fieldDescription")}</Label>
                  <textarea
                    value={trFields[activeLang]?.description ?? ""}
                    onChange={(e) => updateTrField(activeLang, "description", e.target.value)}
                    placeholder={t("services.fieldDescriptionPlaceholder")}
                    rows={3}
                    className="w-full text-sm rounded-lg px-3 py-2 resize-none"
                    style={{
                      background: "var(--admin-card-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {"error" in state && state.error && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{
                color: "#ef4444",
                background: "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
                border: "1px solid color-mix(in srgb, #ef4444 20%, transparent)",
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
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text-muted)",
              }}>
              {t("services.modalCancelButton")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}>
              {isPending ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {isEdit ? t("services.modalSaveButton") : t("services.modalCreateButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-wide mb-1"
      style={{ color: "var(--admin-text-muted)" }}>
      {children}
    </label>
  );
}
