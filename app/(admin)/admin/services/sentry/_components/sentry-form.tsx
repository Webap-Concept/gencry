"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ExternalLink, Info, Loader2, Save, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveSentrySettings,
  testSentry,
  type ActionState,
} from "../actions";

export function SentryForm({ settings }: { settings: AppSettings }) {
  const pathname = usePathname();
  return <SentryFormInner key={pathname} settings={settings} />;
}

function SentryFormInner({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.services.sentry");
  const [saveState, saveAction, isSaving] = useActionState<
    ActionState,
    FormData
  >(saveSentrySettings, {});
  const [testState, testAction, isTesting] = useActionState<
    ActionState,
    FormData
  >(testSentry, {});
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [showDsn, setShowDsn] = useState(false);

  // Tutti i campi sono CONTROLLED. Pattern non-controlled (defaultValue +
  // ref) non funziona qui: dopo il submit di una server action, React 19
  // resetta i form non-controlled al defaultValue iniziale (snapshot al
  // mount), non al valore appena salvato — l'utente vede l'input tornare
  // vuoto finché non fa refresh. Con state controllato il valore resta
  // quello digitato dall'utente.
  const [dsn, setDsn] = useState(settings["sentry.dsn"] ?? "");
  const [environment, setEnvironment] = useState(
    settings["sentry.environment"] ?? "",
  );
  const [pii, setPii] = useState(settings["sentry.send_default_pii"] === "true");
  const [tracesPct, setTracesPct] = useState<string>(() =>
    String(Math.round(Number(settings["sentry.traces_sample_rate"] ?? "0") * 100)),
  );
  const [replayPct, setReplayPct] = useState<string>(() =>
    String(
      Math.round(
        Number(settings["sentry.replays_on_error_sample_rate"] ?? "0") * 100,
      ),
    ),
  );

  const lastSaveTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState)
      setToast({ message: saveState.success, type: "success" });
    if ("error" in saveState)
      setToast({ message: saveState.error, type: "error" });
  }, [saveState]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState)
      setToast({ message: testState.success, type: "success" });
    if ("error" in testState)
      setToast({ message: testState.error, type: "error" });
  }, [testState]);

  function handleTest() {
    // Niente refs: i valori vivono in state controllato e li leggiamo
    // direttamente. Questo elimina il bug del Test che vedeva l'input
    // vuoto subito dopo un Save (post-action React reset dei form
    // non-controlled).
    const fd = new FormData();
    fd.append("sentry_dsn", dsn);
    testAction(fd);
  }

  // Slider 0..100 % nella UI, ma il form invia 0..1 (sample rate Sentry).
  function pctToRate(pct: string): string {
    const n = Number(pct);
    if (!Number.isFinite(n)) return "0";
    return (Math.max(0, Math.min(100, n)) / 100).toString();
  }

  const inputStyle = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };

  return (
    <>
      <form action={saveAction} className="space-y-5">
        {/* ──── Card 1: DSN + test ──────────────────────────────────── */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="flex items-center justify-between mb-5">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {t("dsnCardTitle")}
            </h3>
            <a
              href="https://sentry.io/settings/projects/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: "var(--admin-accent)" }}>
              {t("getDsn")} <ExternalLink size={11} />
            </a>
          </div>

          <div className="space-y-4 max-w-lg">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("dsnLabel")}
              </label>
              <div className="relative">
                <input
                  name="sentry_dsn"
                  type={showDsn ? "text" : "password"}
                  value={dsn}
                  onChange={(e) => setDsn(e.target.value)}
                  placeholder="https://abc@o123.ingest.sentry.io/456"
                  // Niente autofill da password manager: il campo non è
                  // un login, è un endpoint con chiave pubblica. Senza
                  // questi attributi 1Password/Chrome riempivano il
                  // campo con la prima password salvata sul dominio.
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  spellCheck={false}
                  className="w-full px-3 py-2 pr-20 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowDsn((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium px-2 py-0.5 rounded transition-colors"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {showDsn ? t("hide") : t("show")}
                </button>
              </div>
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("dsnHint")}
              </p>

              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting}
                className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-muted)",
                  border: "1px solid var(--admin-card-border)",
                }}>
                {isTesting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Wifi size={13} />
                )}
                {isTesting ? t("testButtonPending") : t("testButton")}
              </button>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("environmentLabel")}
              </label>
              <input
                name="sentry_environment"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                placeholder={t("environmentPlaceholder")}
                autoComplete="off"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("environmentHint")}
              </p>
            </div>
          </div>
        </div>

        {/* ──── Card 2: Sampling + PII ──────────────────────────────── */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-5"
            style={{ color: "var(--admin-text)" }}>
            {t("samplingCardTitle")}
          </h3>

          <div className="space-y-5 max-w-lg">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("tracesLabel")}{" "}
                <span style={{ color: "var(--admin-accent)" }}>
                  {tracesPct}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={tracesPct}
                onChange={(e) => setTracesPct(e.target.value)}
                className="w-full"
              />
              <input
                type="hidden"
                name="sentry_traces_sample_rate"
                value={pctToRate(tracesPct)}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("tracesHint")}
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("replayLabel")}{" "}
                <span style={{ color: "var(--admin-accent)" }}>
                  {replayPct}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={replayPct}
                onChange={(e) => setReplayPct(e.target.value)}
                className="w-full"
              />
              <input
                type="hidden"
                name="sentry_replays_on_error_sample_rate"
                value={pctToRate(replayPct)}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("replayHint")}
              </p>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="sentry_send_default_pii"
                name="sentry_send_default_pii"
                value="true"
                checked={pii}
                onChange={(e) => setPii(e.target.checked)}
                className="mt-0.5"
              />
              <label
                htmlFor="sentry_send_default_pii"
                className="text-xs"
                style={{ color: "var(--admin-text-muted)" }}>
                <span
                  className="font-medium block"
                  style={{ color: "var(--admin-text)" }}>
                  {t("piiLabel")}
                </span>
                {t("piiHint")}
              </label>
            </div>
          </div>
        </div>

        {/* ──── Card 3: Source Maps — env vars Vercel ──────────────── */}
        {/* Org / project / auth token NON vivono qui: li legge il plugin
            @sentry/nextjs in next.config.ts a build-time, e quel processo
            non ha accesso al DB delle app_settings (gira su Vercel prima
            che la funzione serverless esista). Dobbiamo passarli via env
            vars del progetto Vercel. Se mancano, il build non crasha ma
            l'upload source maps è skippato → stack trace minified in
            produzione. */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-2"
            style={{ color: "var(--admin-text)" }}>
            {t("sourceMapsCardTitle")}
          </h3>
          <p
            className="text-[11px] mb-4"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("sourceMapsCardHint")}
          </p>

          <div
            className="flex gap-3 px-4 py-3 rounded-lg text-xs max-w-lg"
            style={{
              background:
                "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))",
              border:
                "1px solid color-mix(in oklch, var(--admin-accent) 20%, transparent)",
            }}>
            <Info
              size={14}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--admin-accent)" }}
            />
            <div className="space-y-2">
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("vercelInfoBody")}
              </p>
              <ul
                className="space-y-1 pl-0 list-none"
                style={{ color: "var(--admin-text-muted)" }}>
                {(
                  ["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"] as const
                ).map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <span
                      className="font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--admin-card-border)",
                        color: "var(--admin-text)",
                      }}>
                      {name}
                    </span>
                  </li>
                ))}
              </ul>
              <a
                href="https://vercel.com/docs/environment-variables"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1"
                style={{ color: "var(--admin-accent)" }}>
                {t("vercelInfoLink")} <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}
          onMouseEnter={(e) =>
            !isSaving &&
            (e.currentTarget.style.background = "var(--admin-accent-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--admin-accent)")
          }>
          {isSaving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isSaving ? t("saving") : t("save")}
        </button>
      </form>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
