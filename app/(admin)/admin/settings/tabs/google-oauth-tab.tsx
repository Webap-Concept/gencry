"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { Eye, EyeOff, Loader2, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveGoogleOAuthSettings,
  testGoogleOAuthSettings,
  type ActionState,
} from "../actions";

export function GoogleOAuthTab({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.settings.googleOAuth");
  const [showSecret, setShowSecret] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const clientIdRef     = useRef<HTMLInputElement>(null);
  const clientSecretRef = useRef<HTMLInputElement>(null);
  const redirectUriRef  = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveGoogleOAuthSettings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testGoogleOAuthSettings,
    {},
  );

  const lastSaveTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState) setToast({ message: saveState.success, type: "success" });
    if ("error"   in saveState) setToast({ message: saveState.error,   type: "error" });
  }, [saveState]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState) setToast({ message: testState.success, type: "success" });
    if ("error"   in testState) setToast({ message: testState.error,   type: "error" });
  }, [testState]);

  const secretMasked = settings.google_client_secret
    ? settings.google_client_secret.slice(0, 6) + "????????????????"
    : "";

  function handleTest() {
    const fd = new FormData();
    fd.append("google_client_id",     clientIdRef.current?.value     ?? "");
    fd.append("google_client_secret", clientSecretRef.current?.value ?? "");
    fd.append("google_redirect_uri",  redirectUriRef.current?.value  ?? "");
    testAction(fd);
  }

  return (
    <>
      <div className="space-y-6">
        <form action={saveAction} className="space-y-5">

          {/* Client ID */}
          <div className="space-y-1.5">
            <label
              htmlFor="google_client_id"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("clientIdLabel")}
            </label>
            <input
              ref={clientIdRef}
              id="google_client_id"
              name="google_client_id"
              type="text"
              defaultValue={settings.google_client_id ?? ""}
              placeholder="123456789-abcdefg.apps.googleusercontent.com"
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{
                background: "var(--admin-input-bg)",
                border: "1px solid var(--admin-card-border)",
                color: "var(--admin-text)",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--admin-card-border)")}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("clientIdHintBefore")}{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--admin-accent)" }}
                className="underline underline-offset-2">
                {t("clientIdHintLink")}
              </a>{" "}
              {t("clientIdHintAfter")}
            </p>
          </div>

          {/* Client Secret */}
          <div className="space-y-1.5">
            <label
              htmlFor="google_client_secret"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("clientSecretLabel")}
            </label>
            <div className="relative">
              <input
                ref={clientSecretRef}
                id="google_client_secret"
                name="google_client_secret"
                type={showSecret ? "text" : "password"}
                defaultValue={settings.google_client_secret ?? ""}
                placeholder={secretMasked || "GOCSPX-????????????????"}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono"
                style={{
                  background: "var(--admin-input-bg)",
                  border: "1px solid var(--admin-card-border)",
                  color: "var(--admin-text)",
                  outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--admin-card-border)")}
              />
              <button
                type="button"
                aria-label={showSecret ? t("hideSecretAria") : t("showSecretAria")}
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                style={{ color: "var(--admin-text-muted)" }}>
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("clientSecretHint")}
            </p>
          </div>

          {/* Redirect URI */}
          <div className="space-y-1.5">
            <label
              htmlFor="google_redirect_uri"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("redirectUriLabel")}
            </label>
            <input
              ref={redirectUriRef}
              id="google_redirect_uri"
              name="google_redirect_uri"
              type="url"
              defaultValue={settings.google_redirect_uri ?? ""}
              placeholder={t("redirectUriPlaceholder")}
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{
                background: "var(--admin-input-bg)",
                border: "1px solid var(--admin-card-border)",
                color: "var(--admin-text)",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--admin-card-border)")}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("redirectUriHint")}
            </p>
          </div>

          {/* Info Box */}
          <div
            className="flex gap-3 px-4 py-3 rounded-lg text-xs"
            style={{
              background: "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))",
              border: "1px solid color-mix(in oklch, var(--admin-accent) 20%, transparent)",
            }}>
            <ShieldCheck
              size={14}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--admin-accent)" }}
            />
            <div className="space-y-1.5">
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine1Before")}{" "}
                <strong style={{ color: "var(--admin-text)" }}>{t("infoBoxLine1Db")}</strong>{" "}
                {t("infoBoxLine1After")}{" "}
                <code
                  className="px-1 rounded"
                  style={{ background: "var(--admin-card-border)", color: "var(--admin-text)" }}>
                  GOOGLE_CLIENT_ID
                </code>{" "}/
                <code
                  className="px-1 rounded"
                  style={{ background: "var(--admin-card-border)", color: "var(--admin-text)" }}>
                  GOOGLE_CLIENT_SECRET
                </code>.
              </p>
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine2Before")}{" "}
                <strong style={{ color: "var(--admin-text)" }}>{t("infoBoxLine2Pkce")}</strong>{" "}
                {t("infoBoxLine2After")}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) =>
                !isSaving && (e.currentTarget.style.background = "var(--admin-accent-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--admin-accent)")
              }>
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isSaving ? t("savingButton") : t("saveButton")}
            </button>

            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text)",
                border: "1px solid var(--admin-card-border)",
              }}
              onMouseEnter={(e) =>
                !isTesting &&
                (e.currentTarget.style.background = "var(--admin-sidebar-item-hover-bg)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--admin-hover-bg)")
              }>
              {isTesting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ShieldCheck size={15} />
              )}
              {isTesting ? t("testingButton") : t("testButton")}
            </button>
          </div>
        </form>
      </div>

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
