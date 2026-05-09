"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ExternalLink, Loader2, Save, Wifi } from "lucide-react";
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
  const [showToken, setShowToken] = useState(false);
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

  const dsnRef = useRef<HTMLInputElement>(null);
  const orgRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
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
    const fd = new FormData();
    fd.append("sentry_dsn", dsnRef.current?.value ?? "");
    fd.append("sentry_org", orgRef.current?.value ?? "");
    fd.append("sentry_project", projectRef.current?.value ?? "");
    fd.append("sentry_auth_token", tokenRef.current?.value ?? "");
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
                  ref={dsnRef}
                  name="sentry_dsn"
                  type={showDsn ? "text" : "password"}
                  defaultValue={settings["sentry.dsn"] ?? ""}
                  placeholder="https://abc@o123.ingest.sentry.io/456"
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
                defaultValue={settings["sentry.environment"] ?? ""}
                placeholder={t("environmentPlaceholder")}
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

        {/* ──── Card 3: Source Maps (org/project/token) ───────────── */}
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
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("sourceMapsCardHint")}
          </p>

          <div className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("orgLabel")}
                </label>
                <input
                  ref={orgRef}
                  name="sentry_org"
                  defaultValue={settings["sentry.org"] ?? ""}
                  placeholder="acme-inc"
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("projectLabel")}
                </label>
                <input
                  ref={projectRef}
                  name="sentry_project"
                  defaultValue={settings["sentry.project"] ?? ""}
                  placeholder="my-web"
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("authTokenLabel")}
              </label>
              <div className="relative">
                <input
                  ref={tokenRef}
                  name="sentry_auth_token"
                  type={showToken ? "text" : "password"}
                  defaultValue={settings["sentry.auth_token"] ?? ""}
                  placeholder="sntrys_..."
                  className="w-full px-3 py-2 pr-20 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium px-2 py-0.5 rounded transition-colors"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {showToken ? t("hide") : t("show")}
                </button>
              </div>
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("authTokenHint")}
              </p>
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
