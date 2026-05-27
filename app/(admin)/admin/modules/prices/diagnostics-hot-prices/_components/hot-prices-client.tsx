"use client";
// app/(admin)/admin/services/hot-prices-test/_components/hot-prices-client.tsx

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Database,
  PlayCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  forceSyncAction,
  loadDiagnostics,
  writeSampleAction,
  type DiagnosticsState,
  type ForceSyncResult,
  type SampleWriteResult,
} from "../actions";

export function HotPricesClient({
  initialDiagnostics,
}: {
  initialDiagnostics: DiagnosticsState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diag, setDiag] = useState<DiagnosticsState>(initialDiagnostics);
  const [sampleResult, setSampleResult] = useState<SampleWriteResult | null>(null);
  const [syncResult, setSyncResult] = useState<ForceSyncResult | null>(null);

  function refreshDiag() {
    startTransition(async () => {
      const next = await loadDiagnostics();
      setDiag(next);
    });
  }

  function runWriteSample() {
    startTransition(async () => {
      setSampleResult(null);
      const res = await writeSampleAction();
      setSampleResult(res);
      const next = await loadDiagnostics();
      setDiag(next);
    });
  }

  function runForceSync() {
    startTransition(async () => {
      setSyncResult(null);
      const res = await forceSyncAction();
      setSyncResult(res);
      const next = await loadDiagnostics();
      setDiag(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Section
        icon={Database}
        title="Stato Redis hot layer"
        right={
          <AdminButton
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={refreshDiag}
            disabled={pending}>
            {pending ? "Aggiornando…" : "Refresh"}
          </AdminButton>
        }>
        <Row label="Upstash configurato">
          {diag.upstashConfigured ? <Yes /> : <No />}
        </Row>
        <Row label="PING latenza">
          {diag.redisPing ? (
            diag.redisPing.ok ? (
              <Text>OK · {diag.redisPing.latencyMs} ms</Text>
            ) : (
              <Bad>ERR · {diag.redisPing.error ?? "—"}</Bad>
            )
          ) : (
            <Text>—</Text>
          )}
        </Row>
        <Row label="Chiave prices:current:all">
          {diag.hotSnapshot.present ? <Yes /> : <No />}
        </Row>
        {diag.hotSnapshot.present && (
          <>
            <Row label="Aggiornata">
              <Text>
                {new Date(diag.hotSnapshot.updatedAt).toLocaleString()} ·{" "}
                {diag.hotSnapshot.ageSeconds}s fa
              </Text>
            </Row>
            <Row label="Numero coin nel payload">
              <Text>{diag.hotSnapshot.quotesCount}</Text>
            </Row>
            <Row label="Sample symbols">
              <Text>{diag.hotSnapshot.sampleSymbols.join(", ") || "—"}</Text>
            </Row>
          </>
        )}
        <Row label="TTL residuo (sec)">
          <Text>{diag.ttlSeconds ?? "—"}</Text>
        </Row>
        <Row label="Dimensione raw JSON (bytes)">
          <Text>{diag.rawValueLength ?? "—"}</Text>
        </Row>
      </Section>

      <Section
        icon={Activity}
        title="Test write sample"
        description="Scrive 2 coin dummy (BTC/ETH) in prices:current:all per validare il path scrittura.">
        <AdminButton
          variant="secondary"
          size="sm"
          icon={Activity}
          onClick={runWriteSample}
          disabled={pending}>
          {pending ? "Scrivendo…" : "Esegui write sample"}
        </AdminButton>
        {sampleResult && (
          <ResultCard ok={sampleResult.ok}>
            {sampleResult.ok ? (
              <Text>
                Scritti {sampleResult.quotesWritten} coin · {sampleResult.latencyMs} ms
              </Text>
            ) : (
              <Bad>{sampleResult.error}</Bad>
            )}
          </ResultCard>
        )}
      </Section>

      <Section
        icon={PlayCircle}
        title="Force cron sync"
        description="Chiama runPricesSync(force=true), bypassa il cadence check. Scrive Upstash + prices_data + prices_history nel run.">
        <AdminButton
          variant="primary"
          size="sm"
          icon={PlayCircle}
          onClick={runForceSync}
          disabled={pending}>
          {pending ? "Eseguendo cron…" : "Run cron now"}
        </AdminButton>
        {syncResult && (
          <ResultCard ok={syncResult.ok}>
            {syncResult.ok ? (
              <div className="space-y-1 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                <p>Durata: <strong>{syncResult.durationMs} ms</strong></p>
                <p>Coin totali: <strong>{syncResult.coinsTotal}</strong></p>
                <p>Coin aggiornati (upsert DB): <strong>{syncResult.coinsUpdated}</strong></p>
                <p>Source usato: <strong>{syncResult.sourceUsed ?? "—"}</strong></p>
              </div>
            ) : (
              <Bad>{syncResult.error}</Bad>
            )}
          </ResultCard>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  right,
  children,
}: {
  icon: typeof Database;
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl p-5 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <Icon size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              {title}
            </h3>
            {description && (
              <p className="text-[12px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
                {description}
              </p>
            )}
          </div>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[200px_1fr] gap-3 text-[12.5px] py-1.5"
      style={{ color: "var(--admin-text-muted)" }}>
      <span style={{ color: "var(--admin-text-faint)" }}>{label}</span>
      <span style={{ color: "var(--admin-text)" }}>{children}</span>
    </div>
  );
}

function Yes() {
  return (
    <span className="inline-flex items-center gap-1" style={{ color: "var(--gc-pos, #10b981)" }}>
      <CheckCircle2 size={13} /> sì
    </span>
  );
}
function No() {
  return (
    <span className="inline-flex items-center gap-1" style={{ color: "var(--gc-neg, #dc2626)" }}>
      <XCircle size={13} /> no
    </span>
  );
}
function Text({ children }: { children: React.ReactNode }) {
  return <span>{children}</span>;
}
function Bad({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--gc-neg, #dc2626)" }}>{children}</span>;
}
function ResultCard({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--admin-page-bg)",
        border: `1px solid ${
          ok ? "color-mix(in srgb, #10b981 35%, transparent)" : "color-mix(in srgb, #dc2626 35%, transparent)"
        }`,
      }}>
      {children}
    </div>
  );
}
