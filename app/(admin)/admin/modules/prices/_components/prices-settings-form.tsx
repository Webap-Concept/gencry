"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { savePricesSettings, type ActionState } from "../actions";

interface InitialValues {
  "modules.prices.cron_minutes": string;
  "modules.prices.universe_hours": string;
  "modules.prices.delta_threshold": string;
  "modules.prices.kv_ttl_seconds": string;
  "modules.prices.breaker_max_err": string;
  "modules.prices.breaker_window_s": string;
  "modules.prices.breaker_open_s": string;
  "modules.prices.snapshot_minutes": string;
  "modules.prices.retention_days": string;
  "modules.prices.coingecko_pro_enabled": string;
  "modules.prices.coingecko_pro_api_key": string | null;
}

const FIELDS: Array<{
  name: keyof InitialValues;
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
    label: "Sync interval (minutes)",
    hint: "How often the cron pulls fresh prices from CoinGecko/DexScreener.",
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
  {
    name: "modules.prices.kv_ttl_seconds",
    label: "KV cache TTL (seconds)",
    hint: "Edge cache TTL for current price reads (when KV is wired in).",
    group: "ingestion",
    type: "number",
    min: 1,
    max: 3600,
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
    label: "Snapshot interval (minutes)",
    hint: "How often a row is written to coin_prices for sparklines.",
    group: "history",
    type: "number",
    min: 1,
    max: 60,
  },
  {
    name: "modules.prices.retention_days",
    label: "Sparkline retention (days)",
    hint: "Older points are deleted by the daily cleanup cron.",
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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
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

  const groups = (["ingestion", "breaker", "history"] as const).map((g) => ({
    key: g,
    title: GROUP_TITLES[g],
    fields: FIELDS.filter((f) => f.group === g),
  }));

  return (
    <>
      <form action={formAction} className="space-y-5">
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
              <input
                name="modules.prices.coingecko_pro_api_key"
                type="password"
                defaultValue={initial["modules.prices.coingecko_pro_api_key"] ?? ""}
                autoComplete="off"
                spellCheck={false}
                placeholder="CG-..."
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--admin-text-faint)" }}>
                Stored as a setting; not exposed to the public app. Required only if Pro is enabled.
              </p>
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
