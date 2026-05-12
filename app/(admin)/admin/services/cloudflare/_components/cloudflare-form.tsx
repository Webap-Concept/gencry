"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { CheckCircle2, Eye, EyeOff, HardDrive, Loader2, Save, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveAvatarR2Settings,
  saveCloudflareSettings,
  testAvatarR2,
  testCloudflareSettings,
  type ActionState,
} from "../actions";

export function CloudflareForm({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.services.cloudflare");
  const [showSecret, setShowSecret] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const siteKeyRef = useRef<HTMLInputElement>(null);
  const secretKeyRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveCloudflareSettings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testCloudflareSettings,
    {},
  );

  const lastSaveTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState) setToast({ message: saveState.success, type: "success" });
    if ("error" in saveState) setToast({ message: saveState.error, type: "error" });
  }, [saveState]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState) setToast({ message: testState.success, type: "success" });
    if ("error" in testState) setToast({ message: testState.error, type: "error" });
  }, [testState]);

  const secretMasked = settings.cf_turnstile_secret_key
    ? settings.cf_turnstile_secret_key.slice(0, 6) + "????????????????"
    : "";

  function handleTest() {
    const fd = new FormData();
    fd.append("cf_turnstile_secret_key", secretKeyRef.current?.value ?? "");
    testAction(fd);
  }

  return (
    <>
      <form action={saveAction} className="space-y-5">
        <div
          className="rounded-xl shadow-sm p-6 space-y-5"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="space-y-1.5">
            <label
              htmlFor="cf_turnstile_site_key"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("siteKeyLabel")}
            </label>
            <input
              ref={siteKeyRef}
              id="cf_turnstile_site_key"
              name="cf_turnstile_site_key"
              type="text"
              defaultValue={settings.cf_turnstile_site_key ?? ""}
              placeholder="0x4AAAAAAA…"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("siteKeyHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cf_turnstile_secret_key"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("secretKeyLabel")}
            </label>
            <div className="relative">
              <input
                ref={secretKeyRef}
                id="cf_turnstile_secret_key"
                name="cf_turnstile_secret_key"
                type={showSecret ? "text" : "password"}
                defaultValue={settings.cf_turnstile_secret_key ?? ""}
                placeholder={secretMasked || "0x4AAAAAAA????????????????"}
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                  outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
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
              {t("secretKeyHint")}
            </p>
          </div>

          <div
            className="flex gap-3 px-4 py-3 rounded-lg text-xs"
            style={{
              background: "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))",
              border: "1px solid color-mix(in oklch, var(--admin-accent) 20%, transparent)",
            }}>
            <Shield
              size={14}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--admin-accent)" }}
            />
            <div className="space-y-1.5">
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine1Before")}{" "}
                <strong style={{ color: "var(--admin-text)" }}>
                  {t("infoBoxBrand")}
                </strong>{" "}
                {t("infoBoxLine1After")}
              </p>
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine2Before")}{" "}
                <span className="font-semibold" style={{ color: "var(--admin-accent)" }}>
                  {t("infoBoxLine2Path")}
                </span>{" "}
                {t("infoBoxLine2After")}{" "}
                <span className="italic">{t("infoBoxLine2WidgetType")}</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            {isTesting ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
            {isTesting ? t("testingButton") : t("testButton")}
          </button>
        </div>
      </form>

      <AvatarR2Card settings={settings} onToast={setToast} />

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

// ─────────────────────────────────────────────────────────────────────────
// R2 storage — avatars (core feature, settings separate dal modulo prices)
// ─────────────────────────────────────────────────────────────────────────

function AvatarR2Card({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveAvatarR2Settings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testAvatarR2,
    {},
  );
  const lastSaveTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState) onToast({ message: saveState.success, type: "success" });
    if ("error" in saveState) onToast({ message: saveState.error, type: "error" });
  }, [saveState, onToast]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState) onToast({ message: testState.success, type: "success" });
    if ("error" in testState) onToast({ message: testState.error, type: "error" });
  }, [testState, onToast]);

  const r2SecretIsSet = Boolean(settings["storage.avatar.r2.secret_access_key"]);
  const allFilled =
    Boolean(settings["storage.avatar.r2.account_id"]) &&
    Boolean(settings["storage.avatar.r2.access_key_id"]) &&
    r2SecretIsSet &&
    Boolean(settings["storage.avatar.r2.bucket"]) &&
    Boolean(settings["storage.avatar.r2.public_base_url"]);

  return (
    <form action={saveAction} className="mt-5">
      <div
        className="rounded-xl shadow-sm p-6 space-y-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <HardDrive size={16} style={{ color: "var(--admin-accent)" }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              R2 storage — avatars
            </h3>
          </div>
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
        <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          User avatars are mirrored to a dedicated R2 bucket so the public app never serves them
          from Supabase Storage (egress on R2 is $0). When unconfigured, avatar uploads fail with
          an explicit error — there is no Supabase fallback.
        </p>

        <div className="space-y-4 max-w-lg">
          <AvatarR2Field
            name="storage.avatar.r2.account_id"
            label="Account ID"
            hint="Cloudflare account ID (the part before .r2.cloudflarestorage.com in the endpoint)."
            defaultValue={settings["storage.avatar.r2.account_id"] ?? ""}
            placeholder="32 hex chars"
          />
          <AvatarR2Field
            name="storage.avatar.r2.access_key_id"
            label="Access key ID"
            hint='From the R2 token (Account API Token, scoped to this bucket, "Object Read & Write").'
            defaultValue={settings["storage.avatar.r2.access_key_id"] ?? ""}
            placeholder=""
          />
          <AvatarR2Field
            name="storage.avatar.r2.secret_access_key"
            label="Secret access key"
            hint="Sensitive. Leave the masked placeholder unchanged to keep the saved value."
            defaultValue={r2SecretIsSet ? "********" : ""}
            placeholder=""
            type="password"
          />
          <AvatarR2Field
            name="storage.avatar.r2.bucket"
            label="Bucket name"
            hint="The bucket dedicated to avatars (e.g. avatars)."
            defaultValue={settings["storage.avatar.r2.bucket"] ?? ""}
            placeholder="avatars"
          />
          <AvatarR2Field
            name="storage.avatar.r2.public_base_url"
            label="Public base URL"
            hint="Custom domain bound to the bucket (no trailing slash). Files become <base>/<userId>.<ext>."
            defaultValue={settings["storage.avatar.r2.public_base_url"] ?? ""}
            placeholder="https://avatars.example.com"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || isTesting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            type="submit"
            formAction={testAction}
            disabled={isSaving || isTesting}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "var(--admin-hover-bg)",
              color: "var(--admin-text)",
              border: "1px solid var(--admin-card-border)",
            }}>
            {isTesting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {isTesting ? "Testing..." : "Test connection"}
          </button>
        </div>
      </div>
    </form>
  );
}

function AvatarR2Field({
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
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        spellCheck={false}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text)",
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
      />
      <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}
