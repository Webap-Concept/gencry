"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  savePricesSettings,
  testCoinGeckoProAction,
  testR2Action,
  type ActionState,
} from "../actions";

interface InitialValues {
  "modules.prices.cron_minutes": string;
  "modules.prices.universe_hours": string;
  "modules.prices.delta_threshold": string;
  "modules.prices.breaker_max_err": string;
  "modules.prices.breaker_window_s": string;
  "modules.prices.breaker_open_s": string;
  "modules.prices.snapshot_minutes": string;
  "modules.prices.retention_days": string;
  "modules.prices.coingecko_pro_enabled": string;
  "modules.prices.coingecko_pro_api_key": string | null;
  "modules.prices.cryptocompare_api_key": string | null;
  // R2 storage. `r2SecretIsSet` viene calcolato server-side: il valore reale
  // del secret NON viaggia mai al client (sicurezza). La UI mostra il
  // sentinel "********" come placeholder se il secret è già salvato.
  "modules.prices.r2.account_id": string | null;
  "modules.prices.r2.access_key_id": string | null;
  "modules.prices.r2.bucket": string | null;
  "modules.prices.r2.public_base_url": string | null;
  r2SecretIsSet: boolean;
}

type NumericFieldName = Extract<
  keyof InitialValues,
  | "modules.prices.cron_minutes"
  | "modules.prices.universe_hours"
  | "modules.prices.delta_threshold"
  | "modules.prices.breaker_max_err"
  | "modules.prices.breaker_window_s"
  | "modules.prices.breaker_open_s"
  | "modules.prices.snapshot_minutes"
  | "modules.prices.retention_days"
>;

const FIELDS: Array<{
  name: NumericFieldName;
  label: string;
  hint: string;
  group: "ingestion" | "breaker" | "history";
  type: "number" | "decimal";
  min: number;
  max: number;
  step?: string;
}> = [
  // Ingestion
  {
    name: "modules.prices.cron_minutes",
    label: "Min sync interval (minutes)",
    hint: "Lower bound enforced in the route as an early-exit guard. pg_cron is the actual scheduler — to raise the cadence, run cron.alter_job on the price-sync job. Lowering this here lets you slow the sync without touching SQL.",
    group: "ingestion",
    type: "number",
    min: 1,
    max: 60,
  },
  {
    name: "modules.prices.universe_hours",
    label: "Active universe window (hours)",
    hint: "Coins last seen within this window are kept refreshed by the cron.",
    group: "ingestion",
    type: "number",
    min: 1,
    max: 168,
  },
  {
    name: "modules.prices.delta_threshold",
    label: "Upsert delta threshold",
    hint: "Skip writes if relative change is below this (e.g. 0.0005 = 0.05%).",
    group: "ingestion",
    type: "decimal",
    min: 0.00001,
    max: 0.5,
    step: "0.00001",
  },
  // Circuit breaker
  {
    name: "modules.prices.breaker_max_err",
    label: "Breaker — max errors",
    hint: "Consecutive errors within the window before the source is marked open.",
    group: "breaker",
    type: "number",
    min: 1,
    max: 100,
  },
  {
    name: "modules.prices.breaker_window_s",
    label: "Breaker — error window (seconds)",
    hint: "Errors older than this don't count toward opening the breaker.",
    group: "breaker",
    type: "number",
    min: 10,
    max: 86400,
  },
  {
    name: "modules.prices.breaker_open_s",
    label: "Breaker — open duration (seconds)",
    hint: "How long the source stays skipped after opening before retrying (half-open).",
    group: "breaker",
    type: "number",
    min: 10,
    max: 86400,
  },
  // History
  {
    name: "modules.prices.snapshot_minutes",
    label: "Min snapshot interval (minutes)",
    hint: "Lower bound for sparkline snapshots — early-exit guard, same logic as the sync interval. The actual cadence is set in pg_cron.",
    group: "history",
    type: "number",
    min: 1,
    max: 60,
  },
  {
    name: "modules.prices.retention_days",
    label: "History retention (days)",
    hint: "Daily cleanup cron deletes prices_history points older than this. Affects the interactive chart (1d/1w/1m/1y) — beyond this window the chart falls back to CoinGecko.",
    group: "history",
    type: "number",
    min: 1,
    max: 365,
  },
];

const GROUP_TITLES: Record<"ingestion" | "breaker" | "history", string> = {
  ingestion: "Ingestion",
  breaker: "Circuit breaker",
  history: "Historical (sparklines)",
};

export function PricesSettingsForm({ initial }: { initial: InitialValues }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    savePricesSettings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testCoinGeckoProAction,
    {},
  );
  const [r2TestState, r2TestAction, isR2Testing] = useActionState<ActionState, FormData>(
    testR2Action,
    {},
  );
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const lastTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);
  const lastR2TestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state && state.success)
      setToast({ message: state.success, type: "success" });
    if ("error" in state && state.error)
      setToast({ message: state.error, type: "error" });
  }, [state]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState && testState.success)
      setToast({ message: testState.success, type: "success" });
    if ("error" in testState && testState.error)
      setToast({ message: testState.error, type: "error" });
  }, [testState]);

  useEffect(() => {
    if (!("timestamp" in r2TestState)) return;
    if (r2TestState.timestamp === lastR2TestTs.current) return;
    lastR2TestTs.current = r2TestState.timestamp;
    if ("success" in r2TestState && r2TestState.success)
      setToast({ message: r2TestState.success, type: "success" });
    if ("error" in r2TestState && r2TestState.error)
      setToast({ message: r2TestState.error, type: "error" });
  }, [r2TestState]);

  const groups = (["ingestion", "breaker", "history"] as const).map((g) => ({
    key: g,
    title: GROUP_TITLES[g],
    fields: FIELDS.filter((f) => f.group === g),
  }));

  return (
    <>
      <form action={formAction} className="space-y-5">
        {/* Cards principali: 2 per riga su md+, stack su mobile. Save +
            nota schedule restano full-width sotto la grid. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {groups.map((group) => (
          <div
            key={group.key}
            className="rounded-xl shadow-sm p-6"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <h3 className="text-sm font-semibold mb-5" style={{ color: "var(--admin-text)" }}>
              {group.title}
            </h3>
            <div className="space-y-4 max-w-lg">
              {group.fields.map((f) => (
                <div key={f.name}>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {f.label}
                  </label>
                  <input
                    name={f.name}
                    type="number"
                    defaultValue={initial[f.name] ?? ""}
                    min={f.min}
                    max={f.max}
                    step={f.step ?? "1"}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                    style={{
                      background: "var(--admin-page-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                  <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
                    {f.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* CoinGecko Pro card — separated from cron tuning because it's */}
        {/* source-specific configuration. */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--admin-text)" }}>
            Source — CoinGecko Pro
          </h3>
          <p className="text-[11px] mb-5" style={{ color: "var(--admin-text-faint)" }}>
            Switch from the free public endpoint to CoinGecko Pro (requires a paid plan and an API key).
            When enabled, the cron can run as fast as every minute without hitting rate limits.
          </p>
          <div className="space-y-4 max-w-lg">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name="modules.prices.coingecko_pro_enabled"
                value="true"
                defaultChecked={initial["modules.prices.coingecko_pro_enabled"] === "true"}
                className="mt-0.5 w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: "var(--admin-accent)" }}
              />
              <span>
                <span className="block text-sm font-medium" style={{ color: "var(--admin-text)" }}>
                  Use CoinGecko Pro
                </span>
                <span className="block text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                  Calls go to <code className="font-mono">pro-api.coingecko.com</code> with header{" "}
                  <code className="font-mono">x-cg-pro-api-key</code>.
                </span>
              </span>
            </label>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                CoinGecko Pro API key
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  name="modules.prices.coingecko_pro_api_key"
                  type="password"
                  defaultValue={initial["modules.prices.coingecko_pro_api_key"] ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="CG-..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}
                />
                {/* formAction sovrascrive l'action del form solo per questo
                 *  bottone: testa la chiave SENZA salvare il resto. */}
                <button
                  type="submit"
                  formAction={testAction}
                  disabled={isTesting || isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                  style={{
                    background: "transparent",
                    color: "var(--admin-text-muted)",
                    border: "1px solid var(--admin-input-border)",
                  }}>
                  {isTesting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  {isTesting ? "Testing..." : "Test connection"}
                </button>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
                Stored as a setting; not exposed to the public app. Required only if Pro is enabled.
                "Test connection" calls <code className="font-mono">/ping</code> on the Pro endpoint to validate the key.
              </p>
            </div>
          </div>
        </div>

        <R2StorageCard
          initial={initial}
          testAction={r2TestAction}
          isTesting={isR2Testing}
          isPending={isPending}
        />

        {/* CryptoCompare API key card — usata solo dal backfill storico,
            non dal cron sync. Chiave opzionale (free su cryptocompare.com),
            senza si usa il tier pubblico più conservativo. */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--admin-text)" }}>
            Source — CryptoCompare
          </h3>
          <p className="text-[11px] mb-5" style={{ color: "var(--admin-text-faint)" }}>
            Usata solo dal pulsante <em>Backfill price history</em> in Coins
            registry. Free su <code className="font-mono">cryptocompare.com</code>:
            250k req/mese con chiave, ~10 req/s senza. Vuota = endpoint pubblico
            (più lento ma comunque funzionante).
          </p>
          <div className="max-w-lg">
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--admin-text-muted)" }}>
              CryptoCompare API key
            </label>
            <input
              name="modules.prices.cryptocompare_api_key"
              type="password"
              defaultValue={initial["modules.prices.cryptocompare_api_key"] ?? ""}
              autoComplete="off"
              spellCheck={false}
              placeholder="Lascia vuoto per usare il tier pubblico"
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}
            />
          </div>
        </div>
        </div>

        <div
          className="rounded-xl shadow-sm p-4 text-[11px]"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
            color: "var(--admin-text-muted)",
          }}>
          <strong style={{ color: "var(--admin-text)" }}>Note about the cron schedule.</strong>{" "}
          The cron is scheduled by Supabase <code className="font-mono">pg_cron</code> + <code className="font-mono">pg_net</code>.
          The "Sync interval" above is enforced by the route as a minimum — if pg_cron triggers more often
          than this value, the route returns immediately without doing work. To actually fire less or
          more often (e.g. every 1&nbsp;min with Pro enabled), update the schedule in pg_cron with{" "}
          <code className="font-mono">cron.alter_job</code>.
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}>
          {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isPending ? "Saving..." : "Save"}
        </button>
      </form>

      {toast && (
        <AdminToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// R2 storage card — coin images self-hosted on Cloudflare R2
// ---------------------------------------------------------------------------

function R2StorageCard({
  initial,
  testAction,
  isTesting,
  isPending,
}: {
  initial: InitialValues;
  testAction: (formData: FormData) => void;
  isTesting: boolean;
  isPending: boolean;
}) {
  const allFilled =
    Boolean(initial["modules.prices.r2.account_id"]) &&
    Boolean(initial["modules.prices.r2.access_key_id"]) &&
    initial.r2SecretIsSet &&
    Boolean(initial["modules.prices.r2.bucket"]) &&
    Boolean(initial["modules.prices.r2.public_base_url"]);

  return (
    <div
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          Storage — Cloudflare R2 (coin images)
        </h3>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{
            background: allFilled
              ? "color-mix(in srgb, var(--gc-pos, #16a34a) 15%, transparent)"
              : "color-mix(in srgb, var(--admin-text-faint) 15%, transparent)",
            color: allFilled ? "var(--gc-pos, #16a34a)" : "var(--admin-text-faint)",
          }}>
          {allFilled ? "Configured" : "Not configured"}
        </span>
      </div>
      <p className="text-[11px] mb-5" style={{ color: "var(--admin-text-faint)" }}>
        Coin images are downloaded from CoinGecko and mirrored to a dedicated R2 bucket so the public
        frontend never fetches from <code className="font-mono">assets.coingecko.com</code>. Egress on R2
        is $0 — images served via your custom domain. While unconfigured, image URLs in the DB stay on
        CoinGecko and the public picker shows initials only.
      </p>
      <div className="space-y-4 max-w-lg">
        <R2Field
          name="modules.prices.r2.account_id"
          label="Account ID"
          hint="Cloudflare account ID (the part before .r2.cloudflarestorage.com in the endpoint)."
          defaultValue={initial["modules.prices.r2.account_id"] ?? ""}
          placeholder="32 hex chars"
        />
        <R2Field
          name="modules.prices.r2.access_key_id"
          label="Access key ID"
          hint='From the R2 token (Account API token, scoped to this bucket, "Object Read & Write").'
          defaultValue={initial["modules.prices.r2.access_key_id"] ?? ""}
          placeholder=""
        />
        <R2Field
          name="modules.prices.r2.secret_access_key"
          label="Secret access key"
          hint="Sensitive. Leave the masked placeholder unchanged to keep the saved value."
          defaultValue={initial.r2SecretIsSet ? "********" : ""}
          placeholder=""
          type="password"
        />
        <R2Field
          name="modules.prices.r2.bucket"
          label="Bucket name"
          hint="The bucket dedicated to coin images (e.g. coins)."
          defaultValue={initial["modules.prices.r2.bucket"] ?? ""}
          placeholder="coins"
        />
        <R2Field
          name="modules.prices.r2.public_base_url"
          label="Public base URL"
          hint="Custom domain bound to the bucket (no trailing slash). Files become <base>/<symbol>.png."
          defaultValue={initial["modules.prices.r2.public_base_url"] ?? ""}
          placeholder="https://coins.example.com"
        />
        <div>
          {/* formAction overrides the form's main action only for this
           *  button: validate credentials + bucket via HeadBucket WITHOUT
           *  saving anything else. The form must still include the secret
           *  input (or its "********" sentinel — server-side re-reads
           *  the real value from the DB in that case). */}
          <button
            type="submit"
            formAction={testAction}
            disabled={isTesting || isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "transparent",
              color: "var(--admin-text-muted)",
              border: "1px solid var(--admin-input-border)",
            }}>
            {isTesting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            {isTesting ? "Testing..." : "Test connection"}
          </button>
          <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
            Validates credentials + bucket via S3 HeadBucket. Doesn't touch the public URL.
          </p>
        </div>
      </div>
    </div>
  );
}

function R2Field({
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  placeholder: string;
  type?: "text" | "password";
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text)",
        }}
      />
      <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
        {hint}
      </p>
    </div>
  );
}
