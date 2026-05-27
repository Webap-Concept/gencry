"use client";
// app/(admin)/admin/modules/prices/exchanges/_components/exchanges-client.tsx

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
  adminFieldStyle,
} from "@/app/(admin)/admin/_components/admin-dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Activity,
  CheckCircle2,
  Coins,
  Key,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  healthCheckExchangeAction,
  setExchangeApiKeyAction,
  toggleExchangeEnabledAction,
  type HealthCheckActionResult,
} from "../actions";
import type { AdminExchangeRow } from "@/lib/modules/prices/exchanges/queries";

export function ExchangesClient({ initialRows }: { initialRows: AdminExchangeRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [keyEditing, setKeyEditing] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [lastHealth, setLastHealth] = useState<Record<string, HealthCheckActionResult>>({});
  const [error, setError] = useState<string | null>(null);

  function toggleEnabled(id: string, next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await toggleExchangeEnabledAction(id, next);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  function runHealth(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await healthCheckExchangeAction(id);
      setLastHealth((prev) => ({ ...prev, [id]: res }));
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  function openKeyDialog(id: string) {
    setKeyEditing(id);
    setKeyValue("");
    setSecretValue("");
  }

  function closeKeyDialog() {
    setKeyEditing(null);
    setKeyValue("");
    setSecretValue("");
  }

  function saveKey() {
    if (!keyEditing) return;
    const id = keyEditing;
    setError(null);
    startTransition(async () => {
      const res = await setExchangeApiKeyAction(id, keyValue, secretValue);
      if (!res.ok) {
        setError(res.error);
      } else {
        closeKeyDialog();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-lg p-3 text-[12px]"
          style={{
            background: "color-mix(in srgb, var(--gc-neg, #dc2626) 10%, transparent)",
            color: "var(--gc-neg, #dc2626)",
            border: "1px solid color-mix(in srgb, var(--gc-neg, #dc2626) 30%, transparent)",
          }}>
          {error}
        </div>
      )}

      <div className="space-y-3">
        {initialRows.map((row) => (
          <ExchangeCard
            key={row.id}
            row={row}
            pending={pending}
            lastHealthResult={lastHealth[row.id] ?? null}
            onToggleEnabled={(next) => toggleEnabled(row.id, next)}
            onHealthCheck={() => runHealth(row.id)}
            onEditKey={() => openKeyDialog(row.id)}
          />
        ))}
      </div>

      <AdminDialog
        open={keyEditing !== null}
        onOpenChange={(o) => {
          if (!o && !pending) closeKeyDialog();
        }}>
        <AdminDialogContent
          icon={Key}
          size="md"
          title={`API credentials — ${keyEditing ?? ""}`}
          description="API key + (opzionale) secret. Per Binance public endpoints non servono; alcuni exchange (Coinbase Advanced Trade) le richiedono."
          footer={
            <>
              <AdminDialogCancelButton onClick={closeKeyDialog} disabled={pending}>
                Annulla
              </AdminDialogCancelButton>
              <AdminDialogConfirmButton onClick={saveKey} loading={pending}>
                Salva
              </AdminDialogConfirmButton>
            </>
          }>
          <div className="space-y-3">
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
                style={{ color: "var(--admin-text-faint)" }}>
                API key
              </span>
              <input
                type="text"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="(lascia vuoto per rimuovere)"
                style={adminFieldStyle}
              />
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
                style={{ color: "var(--admin-text-faint)" }}>
                API secret (opzionale)
              </span>
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="(lascia vuoto per rimuovere)"
                style={adminFieldStyle}
              />
            </label>
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}

function ExchangeCard({
  row,
  pending,
  lastHealthResult,
  onToggleEnabled,
  onHealthCheck,
  onEditKey,
}: {
  row: AdminExchangeRow;
  pending: boolean;
  lastHealthResult: HealthCheckActionResult | null;
  onToggleEnabled: (next: boolean) => void;
  onHealthCheck: () => void;
  onEditKey: () => void;
}) {
  return (
    <section
      className="rounded-xl p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <Coins size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: "var(--admin-text)" }}>
              {row.label}{" "}
              <code
                className="text-[11px] font-normal ml-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {row.id}
              </code>
            </h3>
            <div
              className="flex items-center gap-2 mt-1 flex-wrap text-[12px]"
              style={{ color: "var(--admin-text-muted)" }}>
              {row.implemented ? (
                <Tag tone="ok">Implementato</Tag>
              ) : (
                <Tag tone="warn">Adapter mancante</Tag>
              )}
              <span style={{ color: "var(--admin-divider)" }}>·</span>
              <span>
                {row.routedCoinCount} coin{" "}
                {row.routedCoinCount === 1 ? "routato" : "routati"}
              </span>
              {row.needsApiKey && (
                <>
                  <span style={{ color: "var(--admin-divider)" }}>·</span>
                  <span>
                    API key: {row.needsApiKey}
                    {row.hasApiKey ? " ✓" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <ToggleSwitch
          checked={row.enabled}
          disabled={pending || !row.implemented}
          onChange={onToggleEnabled}
        />
      </header>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <AdminButton
          size="sm"
          variant="secondary"
          icon={pending ? Loader2 : Activity}
          onClick={onHealthCheck}
          disabled={pending || !row.implemented}>
          Test connessione
        </AdminButton>
        <AdminButton
          size="sm"
          variant="secondary"
          icon={Key}
          onClick={onEditKey}
          disabled={pending}>
          {row.hasApiKey ? "Modifica API key" : "Imposta API key"}
        </AdminButton>
      </div>

      {/* Health history (snapshot DB + ultimo test del session) */}
      <div className="mt-3 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
        {lastHealthResult ? (
          <HealthLine result={lastHealthResult} prefix="Ultimo test (questa sessione):" />
        ) : row.lastHealthCheck ? (
          <span>
            Ultimo health check:{" "}
            <strong style={{ color: "var(--admin-text)" }}>
              {new Date(row.lastHealthCheck).toLocaleString()}
            </strong>{" "}
            ·{" "}
            {row.lastHealthOk ? (
              <span style={{ color: "var(--gc-pos, #10b981)" }}>OK</span>
            ) : (
              <span style={{ color: "var(--gc-neg, #dc2626)" }}>
                FAIL{row.lastHealthError ? ` (${row.lastHealthError})` : ""}
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: "var(--admin-text-faint)" }}>
            Nessun health check ancora eseguito.
          </span>
        )}
      </div>
    </section>
  );
}

function HealthLine({
  result,
  prefix,
}: {
  result: HealthCheckActionResult;
  prefix: string;
}) {
  if (!result.ok) {
    return (
      <span>
        {prefix}{" "}
        <span style={{ color: "var(--gc-neg, #dc2626)" }}>FAIL — {result.error}</span>
      </span>
    );
  }
  if (result.status === "ok") {
    return (
      <span>
        {prefix}{" "}
        <span style={{ color: "var(--gc-pos, #10b981)" }}>OK</span> · {result.latencyMs} ms
      </span>
    );
  }
  return (
    <span>
      {prefix}{" "}
      <span style={{ color: "var(--gc-neg, #dc2626)" }}>
        FAIL{result.error ? ` — ${result.error}` : ""}
      </span>
    </span>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center transition-colors"
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? "var(--admin-accent)" : "var(--admin-hover-bg)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        border: "1px solid var(--admin-card-border)",
      }}>
      <span
        style={{
          position: "absolute",
          left: checked ? 20 : 2,
          top: 1,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 160ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

function Tag({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const colors =
    tone === "ok"
      ? {
          bg: "color-mix(in srgb, #10b981 14%, transparent)",
          fg: "var(--gc-pos, #10b981)",
        }
      : {
          bg: "color-mix(in srgb, #f59e0b 14%, transparent)",
          fg: "#b45309",
        };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: colors.bg, color: colors.fg }}>
      {tone === "ok" ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {children}
    </span>
  );
}
