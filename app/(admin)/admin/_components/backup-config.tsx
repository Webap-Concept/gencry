"use client";

// app/(admin)/admin/_components/backup-config.tsx
//
// Componente riutilizzabile per la configurazione "Backup assurance"
// di una qualsiasi area admin (GDPR oggi, Application Backup domani,
// eventualmente altri moduli). Pattern presentational + driven da prop:
//
// - i `name` attributes degli input vengono dal caller (`fieldNames`)
//   così la stessa UI si aggancia a setting keys diverse (gdpr.backup.* vs
//   app.backup.* vs module/<slug>/backup.*)
// - tutti i testi vengono dal caller (`labels`) — niente uso di
//   useTranslations qui dentro, niente lock-in su un namespace specifico
// - la verifica live PITR è un callback opzionale (`onVerifyPitr`); chi
//   non vuole offrirla lo omette, il bottone non appare
// - i tier che supportano PITR sono parametrici (default Pro+); usabili
//   sia per Supabase che per eventuali altri provider con la stessa
//   struttura tier-based
//
// Il componente NON sa nulla di Supabase: il caller passa la callback
// che chiama `lib/admin/supabase/management.ts` (o un altro client).

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

// ─── Public types ──────────────────────────────────────────────────────────

export type BackupTier = "none" | "supabase_pitr" | "s3" | "external";
export type BackupFrequency =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

/** Stato persistito (read from settings DB), passato come prop. */
export interface BackupConfigInitial {
  tier: BackupTier;
  notes: string | null;
  pitrLastVerifiedAt: string | null;
  pitrLastVerifiedTier: string | null;
  s3LastVerifiedAt: string | null;
  /** "ok" | "forbidden" | "not_found" | "invalid_credentials" | "network_error" | "unknown" */
  s3LastVerifiedStatus: string | null;
  externalProvider: string | null;
  externalFrequency: BackupFrequency | null;
  externalRetentionDays: string | null;
  externalLastVerifiedAt: string | null;
  externalLastVerifiedBy: string | null;
  externalRecoveryTestNotes: string | null;
}

/**
 * Mappa fra il "ruolo logico" del campo e il `name` HTML che il caller
 * vuole vedere nel FormData. Es. la sezione GDPR usa "gdpr.backup.tier",
 * un'eventuale "App Backup" generale userà "app.backup.tier".
 */
export interface BackupConfigFieldNames {
  tier: string;
  notes: string;
  externalProvider: string;
  externalFrequency: string;
  externalRetentionDays: string;
  externalLastVerifiedAt: string;
  externalLastVerifiedBy: string;
  externalRecoveryTestNotes: string;
}

/**
 * Tutti i testi UI. Il caller li costruisce dal proprio namespace
 * `useTranslations(...)`. Tipo esaustivo per non lasciare buchi.
 */
export interface BackupConfigLabels {
  // Section
  sectionTitle: string;
  sectionIntro: string;
  /** Banner permanente in cima al pannello che ricorda che la dashboard
   *  fa solo monitoring, NON esegue il backup. */
  monitoringOnlyBanner: string;
  // Tier select
  tierLabel: string;
  tierHint: string;
  tierNone: string;
  tierPitr: string;
  tierS3: string;
  tierExternal: string;
  // None warning
  noneWarningTitle: string;
  noneWarningBody: string;
  // PITR pane
  pitrPaneTitle: string;
  pitrPaneIntro: string;
  pitrServiceUnconfiguredTitle: string;
  pitrServiceUnconfiguredBody: string;
  pitrServiceConfigureCta: string;
  pitrVerifyButton: string;
  pitrVerifyingButton: string;
  pitrLastCheckLabel: string; // "Last check: {time}" — interpolation handled by caller
  pitrNeverChecked: string;
  pitrSupportedBadge: string;
  pitrUnsupportedBadge: string;
  pitrUnknownBadge: string;
  // S3 pane
  s3PaneTitle: string;
  s3PaneIntro: string;
  s3ServiceUnconfiguredTitle: string;
  s3ServiceUnconfiguredBody: string;
  s3ServiceConfigureCta: string;
  s3VerifyButton: string;
  s3VerifyingButton: string;
  s3LastCheckLabel: string;
  s3NeverChecked: string;
  s3StatusOk: string;
  s3StatusForbidden: string;
  s3StatusNotFound: string;
  s3StatusInvalidCredentials: string;
  s3StatusNetworkError: string;
  s3StatusUnknown: string;
  // External pane
  externalPaneTitle: string;
  externalPaneIntro: string;
  externalProviderLabel: string;
  externalProviderPlaceholder: string;
  externalFrequencyLabel: string;
  externalFrequencyOptions: Record<BackupFrequency, string>;
  externalRetentionLabel: string;
  externalRetentionHint: string;
  externalLastVerifiedLabel: string;
  externalLastVerifiedHint: string;
  externalLastVerifiedByLabel: string;
  externalLastVerifiedByPlaceholder: string;
  externalRecoveryNotesLabel: string;
  externalRecoveryNotesPlaceholder: string;
  // Notes (free-form, sempre disponibile in fondo)
  notesLabel: string;
  notesPlaceholder: string;
  notesHint: string;
}

export interface BackupConfigProps {
  initial: BackupConfigInitial;
  fieldNames: BackupConfigFieldNames;
  labels: BackupConfigLabels;
  /**
   * Quando i tier-based PITR è il tier scelto: passa il flag se il
   * client del provider (es. Supabase Management API) ha le credenziali.
   * Se false, mostriamo una card di setup invece del bottone Verify.
   */
  pitrServiceConfigured: boolean;
  /** Link interno per andare a configurare il servizio (es. /admin/services/supabase). */
  pitrServiceConfigureHref: string;
  /** Callback per la verifica PITR live. Omesso = pulsante non mostrato. */
  onVerifyPitr?: () => Promise<{ ok: boolean; message?: string }>;
  /**
   * Tier che supportano PITR. Default Supabase: pro/team/enterprise.
   * Override per altri provider con tier diversi.
   */
  pitrSupportedTiers?: string[];
  /** Idem PITR ma per il tier S3-compatible (HEAD bucket monitoring). */
  s3ServiceConfigured: boolean;
  s3ServiceConfigureHref: string;
  onVerifyS3?: () => Promise<{ ok: boolean; message?: string }>;
  /**
   * Card style override per integrarsi con il form host. Se null,
   * il componente non rende un wrapper (utile dentro form già stilizzati).
   */
  cardStyle?: React.CSSProperties;
  /**
   * Stile dei input — riutilizzato dal form host.
   */
  inputStyle?: React.CSSProperties;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_PITR_TIERS = ["pro", "team", "enterprise"];

const DEFAULT_CARD_STYLE: React.CSSProperties = {
  background: "var(--admin-card-bg)",
  border: "1px solid var(--admin-card-border)",
};
const DEFAULT_INPUT_STYLE: React.CSSProperties = {
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
};

// ─── Component ─────────────────────────────────────────────────────────────

export function BackupConfig({
  initial,
  fieldNames,
  labels,
  pitrServiceConfigured,
  pitrServiceConfigureHref,
  onVerifyPitr,
  pitrSupportedTiers = DEFAULT_PITR_TIERS,
  s3ServiceConfigured,
  s3ServiceConfigureHref,
  onVerifyS3,
  cardStyle,
  inputStyle,
}: BackupConfigProps) {
  const card = cardStyle ?? DEFAULT_CARD_STYLE;
  const input = inputStyle ?? DEFAULT_INPUT_STYLE;

  // Tier scelto via UI (controllato per rendering condizionale).
  const [tier, setTier] = useState<BackupTier>(initial.tier);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyTransitionPending, startVerify] = useTransition();
  const [s3VerifyError, setS3VerifyError] = useState<string | null>(null);
  const [s3VerifyPending, startS3Verify] = useTransition();

  function handleVerifyPitr() {
    if (!onVerifyPitr) return;
    setVerifyError(null);
    startVerify(async () => {
      const res = await onVerifyPitr();
      if (!res.ok && res.message) setVerifyError(res.message);
    });
  }

  function handleVerifyS3() {
    if (!onVerifyS3) return;
    setS3VerifyError(null);
    startS3Verify(async () => {
      const res = await onVerifyS3();
      if (!res.ok && res.message) setS3VerifyError(res.message);
    });
  }

  const lastTier = initial.pitrLastVerifiedTier;
  const lastAt = initial.pitrLastVerifiedAt;
  const pitrSupported = lastTier ? pitrSupportedTiers.includes(lastTier) : null;

  return (
    <div className="rounded-xl shadow-sm p-6" style={card}>
      <h3
        className="text-sm font-semibold mb-1"
        style={{ color: "var(--admin-text)" }}>
        {labels.sectionTitle}
      </h3>
      <p
        className="text-[11px] mb-5"
        style={{ color: "var(--admin-text-faint)" }}>
        {labels.sectionIntro}
      </p>

      <div className="space-y-4 max-w-2xl">
        {/* Monitoring-only banner — sempre visibile, ricorda che il
            backup avviene altrove. */}
        <div
          className="flex gap-2 px-3 py-2 rounded text-[11px]"
          style={{
            background:
              "color-mix(in srgb, var(--admin-text-faint) 8%, var(--admin-card-bg))",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}>
          <ShieldAlert
            size={12}
            className="shrink-0 mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <span>{labels.monitoringOnlyBanner}</span>
        </div>

        {/* Tier select */}
        <div>
          <label
            htmlFor={fieldNames.tier}
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.tierLabel}
          </label>
          <select
            id={fieldNames.tier}
            name={fieldNames.tier}
            value={tier}
            onChange={(e) => setTier(e.target.value as BackupTier)}
            className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={input}>
            <option value="none">{labels.tierNone}</option>
            <option value="supabase_pitr">{labels.tierPitr}</option>
            <option value="s3">{labels.tierS3}</option>
            <option value="external">{labels.tierExternal}</option>
          </select>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {labels.tierHint}
          </p>
        </div>

        {/* None: warning */}
        {tier === "none" && (
          <div
            className="flex gap-3 px-4 py-3 rounded-lg text-xs"
            style={{
              background: "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
              border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
            }}>
            <AlertTriangle
              size={15}
              className="shrink-0 mt-0.5"
              style={{ color: "#ef4444" }}
            />
            <div>
              <p
                className="font-semibold"
                style={{ color: "#ef4444" }}>
                {labels.noneWarningTitle}
              </p>
              <p className="mt-1" style={{ color: "var(--admin-text-muted)" }}>
                {labels.noneWarningBody}
              </p>
            </div>
          </div>
        )}

        {/* PITR pane */}
        {tier === "supabase_pitr" && (
          <PitrPane
            labels={labels}
            cardStyle={card}
            pitrServiceConfigured={pitrServiceConfigured}
            pitrServiceConfigureHref={pitrServiceConfigureHref}
            onVerify={onVerifyPitr ? handleVerifyPitr : undefined}
            pending={verifyTransitionPending}
            verifyError={verifyError}
            lastVerifiedAt={lastAt}
            lastVerifiedTier={lastTier}
            pitrSupported={pitrSupported}
          />
        )}

        {/* S3 pane */}
        {tier === "s3" && (
          <S3Pane
            labels={labels}
            cardStyle={card}
            s3ServiceConfigured={s3ServiceConfigured}
            s3ServiceConfigureHref={s3ServiceConfigureHref}
            onVerify={onVerifyS3 ? handleVerifyS3 : undefined}
            pending={s3VerifyPending}
            verifyError={s3VerifyError}
            lastVerifiedAt={initial.s3LastVerifiedAt}
            lastVerifiedStatus={initial.s3LastVerifiedStatus}
          />
        )}

        {/* External pane */}
        {tier === "external" && (
          <ExternalPane
            labels={labels}
            fieldNames={fieldNames}
            initial={initial}
            inputStyle={input}
          />
        )}

        {/*
          Hidden inputs per i campi NON visibili nel pane corrente.
          Senza questi, lo switch tier (es. external -> none) cancella i
          dati strutturati al successivo save. Manteniamo i valori
          persistiti nel form anche quando la sezione è nascosta.
        */}
        {tier !== "external" && (
          <ExternalHiddenInputs
            fieldNames={fieldNames}
            initial={initial}
          />
        )}

        {/* Notes free-form (sempre visibile, indipendente dal tier) */}
        <div>
          <label
            htmlFor={fieldNames.notes}
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.notesLabel}
          </label>
          <textarea
            id={fieldNames.notes}
            name={fieldNames.notes}
            rows={3}
            maxLength={2000}
            defaultValue={initial.notes ?? ""}
            placeholder={labels.notesPlaceholder}
            className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
            style={input}
          />
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {labels.notesHint}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── PITR pane ─────────────────────────────────────────────────────────────

function PitrPane({
  labels,
  cardStyle,
  pitrServiceConfigured,
  pitrServiceConfigureHref,
  onVerify,
  pending,
  verifyError,
  lastVerifiedAt,
  lastVerifiedTier,
  pitrSupported,
}: {
  labels: BackupConfigLabels;
  cardStyle: React.CSSProperties;
  pitrServiceConfigured: boolean;
  pitrServiceConfigureHref: string;
  onVerify?: () => void;
  pending: boolean;
  verifyError: string | null;
  lastVerifiedAt: string | null;
  lastVerifiedTier: string | null;
  pitrSupported: boolean | null;
}) {
  const tierBadge = (() => {
    if (lastVerifiedTier === null) return null;
    if (pitrSupported === true) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
          style={{
            background: "color-mix(in srgb, #10b981 14%, transparent)",
            color: "#10b981",
          }}>
          <CheckCircle2 size={10} />
          {labels.pitrSupportedBadge}
        </span>
      );
    }
    if (pitrSupported === false) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
          style={{
            background: "color-mix(in srgb, #ef4444 14%, transparent)",
            color: "#ef4444",
          }}>
          <XCircle size={10} />
          {labels.pitrUnsupportedBadge}
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
        style={{
          background: "color-mix(in srgb, var(--admin-text-faint) 14%, transparent)",
          color: "var(--admin-text-muted)",
        }}>
        <ShieldAlert size={10} />
        {labels.pitrUnknownBadge}
      </span>
    );
  })();

  const formattedLastAt = lastVerifiedAt
    ? new Date(lastVerifiedAt).toLocaleString()
    : null;

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{
        ...cardStyle,
        background:
          "color-mix(in srgb, var(--admin-accent) 4%, var(--admin-card-bg))",
      }}>
      <div className="flex items-start gap-3">
        <Database
          size={15}
          className="shrink-0 mt-0.5"
          style={{ color: "var(--admin-accent)" }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {labels.pitrPaneTitle}
          </p>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.pitrPaneIntro}
          </p>
        </div>
        {tierBadge}
      </div>

      {!pitrServiceConfigured ? (
        <div
          className="px-3 py-2.5 rounded text-[11px] flex items-start gap-2"
          style={{
            background: "color-mix(in srgb, #f59e0b 10%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
          }}>
          <AlertTriangle
            size={12}
            className="shrink-0 mt-0.5"
            style={{ color: "#f59e0b" }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium" style={{ color: "#f59e0b" }}>
              {labels.pitrServiceUnconfiguredTitle}
            </p>
            <p className="mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
              {labels.pitrServiceUnconfiguredBody}
            </p>
          </div>
          <Link
            href={pitrServiceConfigureHref}
            className="text-[11px] px-2.5 py-1 rounded shrink-0"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text-muted)",
            }}>
            {labels.pitrServiceConfigureCta}
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {onVerify && (
            <button
              type="button"
              onClick={onVerify}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
              style={{
                background: "var(--admin-accent)",
                color: "#fff",
              }}>
              {pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ShieldCheck size={12} />
              )}
              {pending ? labels.pitrVerifyingButton : labels.pitrVerifyButton}
            </button>
          )}
          <span
            className="text-[11px]"
            style={{ color: "var(--admin-text-muted)" }}>
            {formattedLastAt
              ? labels.pitrLastCheckLabel.replace("{time}", formattedLastAt)
              : labels.pitrNeverChecked}
          </span>
        </div>
      )}

      {verifyError && (
        <p
          className="text-[11px]"
          style={{ color: "#ef4444" }}>
          {verifyError}
        </p>
      )}
    </div>
  );
}

// ─── S3 pane ───────────────────────────────────────────────────────────────

function S3Pane({
  labels,
  cardStyle,
  s3ServiceConfigured,
  s3ServiceConfigureHref,
  onVerify,
  pending,
  verifyError,
  lastVerifiedAt,
  lastVerifiedStatus,
}: {
  labels: BackupConfigLabels;
  cardStyle: React.CSSProperties;
  s3ServiceConfigured: boolean;
  s3ServiceConfigureHref: string;
  onVerify?: () => void;
  pending: boolean;
  verifyError: string | null;
  lastVerifiedAt: string | null;
  lastVerifiedStatus: string | null;
}) {
  const statusBadge = (() => {
    if (!lastVerifiedStatus) return null;
    const map: Record<string, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
      ok: {
        bg: "color-mix(in srgb, #10b981 14%, transparent)",
        color: "#10b981",
        label: labels.s3StatusOk,
        icon: <CheckCircle2 size={10} />,
      },
      forbidden: {
        bg: "color-mix(in srgb, #ef4444 14%, transparent)",
        color: "#ef4444",
        label: labels.s3StatusForbidden,
        icon: <XCircle size={10} />,
      },
      not_found: {
        bg: "color-mix(in srgb, #ef4444 14%, transparent)",
        color: "#ef4444",
        label: labels.s3StatusNotFound,
        icon: <XCircle size={10} />,
      },
      invalid_credentials: {
        bg: "color-mix(in srgb, #ef4444 14%, transparent)",
        color: "#ef4444",
        label: labels.s3StatusInvalidCredentials,
        icon: <XCircle size={10} />,
      },
      network_error: {
        bg: "color-mix(in srgb, #f59e0b 14%, transparent)",
        color: "#f59e0b",
        label: labels.s3StatusNetworkError,
        icon: <ShieldAlert size={10} />,
      },
      unknown: {
        bg: "color-mix(in srgb, var(--admin-text-faint) 14%, transparent)",
        color: "var(--admin-text-muted)",
        label: labels.s3StatusUnknown,
        icon: <ShieldAlert size={10} />,
      },
    };
    const s = map[lastVerifiedStatus] ?? map.unknown;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
        style={{ background: s.bg, color: s.color }}>
        {s.icon}
        {s.label}
      </span>
    );
  })();

  const formattedLastAt = lastVerifiedAt
    ? new Date(lastVerifiedAt).toLocaleString()
    : null;

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{
        ...cardStyle,
        background:
          "color-mix(in srgb, var(--admin-accent) 4%, var(--admin-card-bg))",
      }}>
      <div className="flex items-start gap-3">
        <Database
          size={15}
          className="shrink-0 mt-0.5"
          style={{ color: "var(--admin-accent)" }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {labels.s3PaneTitle}
          </p>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.s3PaneIntro}
          </p>
        </div>
        {statusBadge}
      </div>

      {!s3ServiceConfigured ? (
        <div
          className="px-3 py-2.5 rounded text-[11px] flex items-start gap-2"
          style={{
            background: "color-mix(in srgb, #f59e0b 10%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
          }}>
          <AlertTriangle
            size={12}
            className="shrink-0 mt-0.5"
            style={{ color: "#f59e0b" }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium" style={{ color: "#f59e0b" }}>
              {labels.s3ServiceUnconfiguredTitle}
            </p>
            <p className="mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
              {labels.s3ServiceUnconfiguredBody}
            </p>
          </div>
          <Link
            href={s3ServiceConfigureHref}
            className="text-[11px] px-2.5 py-1 rounded shrink-0"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text-muted)",
            }}>
            {labels.s3ServiceConfigureCta}
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {onVerify && (
            <button
              type="button"
              onClick={onVerify}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
              style={{
                background: "var(--admin-accent)",
                color: "#fff",
              }}>
              {pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ShieldCheck size={12} />
              )}
              {pending ? labels.s3VerifyingButton : labels.s3VerifyButton}
            </button>
          )}
          <span
            className="text-[11px]"
            style={{ color: "var(--admin-text-muted)" }}>
            {formattedLastAt
              ? labels.s3LastCheckLabel.replace("{time}", formattedLastAt)
              : labels.s3NeverChecked}
          </span>
        </div>
      )}

      {verifyError && (
        <p className="text-[11px]" style={{ color: "#ef4444" }}>
          {verifyError}
        </p>
      )}
    </div>
  );
}

// ─── External pane ─────────────────────────────────────────────────────────

function ExternalPane({
  labels,
  fieldNames,
  initial,
  inputStyle,
}: {
  labels: BackupConfigLabels;
  fieldNames: BackupConfigFieldNames;
  initial: BackupConfigInitial;
  inputStyle: React.CSSProperties;
}) {
  return (
    <div className="space-y-3 rounded-lg p-4"
      style={{
        background: "color-mix(in srgb, var(--admin-text-faint) 5%, var(--admin-card-bg))",
        border: "1px solid var(--admin-card-border)",
      }}>
      <p
        className="text-[11px]"
        style={{ color: "var(--admin-text-muted)" }}>
        {labels.externalPaneIntro}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={fieldNames.externalProvider}
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.externalProviderLabel}
          </label>
          <input
            id={fieldNames.externalProvider}
            name={fieldNames.externalProvider}
            type="text"
            maxLength={200}
            defaultValue={initial.externalProvider ?? ""}
            placeholder={labels.externalProviderPlaceholder}
            className="w-full px-3 py-2 text-sm rounded-lg"
            style={inputStyle}
          />
        </div>
        <div>
          <label
            htmlFor={fieldNames.externalFrequency}
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.externalFrequencyLabel}
          </label>
          <select
            id={fieldNames.externalFrequency}
            name={fieldNames.externalFrequency}
            defaultValue={initial.externalFrequency ?? "daily"}
            className="w-full px-3 py-2 text-sm rounded-lg"
            style={inputStyle}>
            <option value="hourly">{labels.externalFrequencyOptions.hourly}</option>
            <option value="daily">{labels.externalFrequencyOptions.daily}</option>
            <option value="weekly">{labels.externalFrequencyOptions.weekly}</option>
            <option value="monthly">{labels.externalFrequencyOptions.monthly}</option>
            <option value="custom">{labels.externalFrequencyOptions.custom}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={fieldNames.externalRetentionDays}
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.externalRetentionLabel}
          </label>
          <input
            id={fieldNames.externalRetentionDays}
            name={fieldNames.externalRetentionDays}
            type="number"
            min={0}
            max={36500}
            defaultValue={initial.externalRetentionDays ?? "30"}
            className="w-full px-3 py-2 text-sm rounded-lg"
            style={inputStyle}
          />
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {labels.externalRetentionHint}
          </p>
        </div>
        <div>
          <label
            htmlFor={fieldNames.externalLastVerifiedAt}
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {labels.externalLastVerifiedLabel}
          </label>
          <input
            id={fieldNames.externalLastVerifiedAt}
            name={fieldNames.externalLastVerifiedAt}
            type="date"
            defaultValue={initial.externalLastVerifiedAt ?? ""}
            className="w-full px-3 py-2 text-sm rounded-lg"
            style={inputStyle}
          />
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {labels.externalLastVerifiedHint}
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor={fieldNames.externalLastVerifiedBy}
          className="block text-xs font-medium mb-1"
          style={{ color: "var(--admin-text-muted)" }}>
          {labels.externalLastVerifiedByLabel}
        </label>
        <input
          id={fieldNames.externalLastVerifiedBy}
          name={fieldNames.externalLastVerifiedBy}
          type="text"
          maxLength={200}
          defaultValue={initial.externalLastVerifiedBy ?? ""}
          placeholder={labels.externalLastVerifiedByPlaceholder}
          className="w-full px-3 py-2 text-sm rounded-lg"
          style={inputStyle}
        />
      </div>

      <div>
        <label
          htmlFor={fieldNames.externalRecoveryTestNotes}
          className="block text-xs font-medium mb-1"
          style={{ color: "var(--admin-text-muted)" }}>
          {labels.externalRecoveryNotesLabel}
        </label>
        <textarea
          id={fieldNames.externalRecoveryTestNotes}
          name={fieldNames.externalRecoveryTestNotes}
          rows={3}
          maxLength={2000}
          defaultValue={initial.externalRecoveryTestNotes ?? ""}
          placeholder={labels.externalRecoveryNotesPlaceholder}
          className="w-full px-3 py-2 text-sm rounded-lg"
          style={inputStyle}
        />
      </div>
    </div>
  );
}

// ─── Hidden inputs for non-active pane ─────────────────────────────────────
//
// Quando il tier corrente non è "external", manteniamo i valori salvati
// nel form (stessi `name` ma `type="hidden"`) così uno switch tier non
// cancella i dati al prossimo save. Al successivo cambio tier verso
// "external", l'admin ritrova i suoi valori.

function ExternalHiddenInputs({
  fieldNames,
  initial,
}: {
  fieldNames: BackupConfigFieldNames;
  initial: BackupConfigInitial;
}) {
  return (
    <>
      <input
        type="hidden"
        name={fieldNames.externalProvider}
        value={initial.externalProvider ?? ""}
        readOnly
      />
      <input
        type="hidden"
        name={fieldNames.externalFrequency}
        value={initial.externalFrequency ?? "daily"}
        readOnly
      />
      <input
        type="hidden"
        name={fieldNames.externalRetentionDays}
        value={initial.externalRetentionDays ?? "30"}
        readOnly
      />
      <input
        type="hidden"
        name={fieldNames.externalLastVerifiedAt}
        value={initial.externalLastVerifiedAt ?? ""}
        readOnly
      />
      <input
        type="hidden"
        name={fieldNames.externalLastVerifiedBy}
        value={initial.externalLastVerifiedBy ?? ""}
        readOnly
      />
      <input
        type="hidden"
        name={fieldNames.externalRecoveryTestNotes}
        value={initial.externalRecoveryTestNotes ?? ""}
        readOnly
      />
    </>
  );
}
