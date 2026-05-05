"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ExternalLink, Loader2, Save, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveSenderSettings,
  testResendConnection,
  type ActionState,
} from "../actions";

export function SenderTab({ settings }: { settings: AppSettings }) {
  const pathname = usePathname();
  return <SenderTabInner key={pathname} settings={settings} />;
}

function SenderTabInner({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.settings.resend");
  const [saveState, saveAction, isSaving] = useActionState<
    ActionState,
    FormData
  >(saveSenderSettings, {});
  const [testState, testAction, isTesting] = useActionState<
    ActionState,
    FormData
  >(testResendConnection, {});
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const apiKeyRef = useRef<HTMLInputElement>(null);
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
    fd.append("resend_api_key", apiKeyRef.current?.value ?? "");
    testAction(fd);
  }

  const inputStyle = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };

  return (
    <>
      <form action={saveAction} className="space-y-5">
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
              {t("cardTitle")}
            </h3>
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: "var(--admin-accent)" }}>
              {t("getApiKey")} <ExternalLink size={11} />
            </a>
          </div>

          <div className="space-y-4 max-w-lg">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("apiKeyLabel")}
              </label>
              <div className="relative">
                <input
                  ref={apiKeyRef}
                  name="resend_api_key"
                  type={showKey ? "text" : "password"}
                  defaultValue={settings.resend_api_key ?? ""}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 pr-20 text-sm rounded-lg focus:outline-none transition-colors font-mono"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium px-2 py-0.5 rounded transition-colors"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {showKey ? t("hide") : t("show")}
                </button>
              </div>
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("apiKeyHint")}
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
          </div>
        </div>

        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-5"
            style={{ color: "var(--admin-text)" }}>
            {t("senderCardTitle")}
          </h3>

          <div className="space-y-4 max-w-lg">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("senderNameLabel")}
              </label>
              <input
                name="email_from_name"
                defaultValue={settings.email_from_name ?? settings.app_name}
                placeholder={t("senderNamePlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("senderAddressLabel")}
              </label>
              <input
                name="email_from_address"
                type="email"
                defaultValue={settings.email_from_address ?? ""}
                placeholder={t("senderAddressPlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("senderAddressHint")}
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
