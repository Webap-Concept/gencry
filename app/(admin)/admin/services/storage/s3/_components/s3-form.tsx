"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { Eye, EyeOff, HardDrive, Info, Loader2, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveS3Settings, testS3Connection, type ActionState } from "../actions";

export function S3Form({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.services.s3");
  const [showSecret, setShowSecret] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const endpointRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLInputElement>(null);
  const bucketRef = useRef<HTMLInputElement>(null);
  const accessKeyIdRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const prefixRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveS3Settings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testS3Connection,
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

  const secretMasked = settings["s3.secret_access_key"]
    ? settings["s3.secret_access_key"].slice(0, 4) + "????????????????"
    : "";

  function handleTest() {
    const fd = new FormData();
    fd.append("s3.endpoint", endpointRef.current?.value ?? "");
    fd.append("s3.region", regionRef.current?.value ?? "");
    fd.append("s3.bucket", bucketRef.current?.value ?? "");
    fd.append("s3.access_key_id", accessKeyIdRef.current?.value ?? "");
    fd.append("s3.secret_access_key", secretRef.current?.value ?? "");
    testAction(fd);
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
    outline: "none",
  };

  return (
    <>
      <form action={saveAction} className="space-y-5">
        {/* MONITORING ONLY banner */}
        <div
          className="flex gap-3 px-4 py-3 rounded-lg text-xs"
          style={{
            background: "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
          }}>
          <Info
            size={14}
            className="shrink-0 mt-0.5"
            style={{ color: "#f59e0b" }}
          />
          <div>
            <p className="font-semibold" style={{ color: "#f59e0b" }}>
              {t("monitoringOnlyTitle")}
            </p>
            <p className="mt-1" style={{ color: "var(--admin-text-muted)" }}>
              {t("monitoringOnlyBody")}
            </p>
          </div>
        </div>

        <div
          className="rounded-xl shadow-sm p-6 space-y-5"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {/* Endpoint */}
          <div className="space-y-1.5">
            <label
              htmlFor="s3.endpoint"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("endpointLabel")}
            </label>
            <input
              ref={endpointRef}
              id="s3.endpoint"
              name="s3.endpoint"
              type="text"
              defaultValue={settings["s3.endpoint"] ?? ""}
              placeholder={t("endpointPlaceholder")}
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("endpointHint")}
            </p>
          </div>

          {/* Region + Bucket */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="s3.region"
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("regionLabel")}
              </label>
              <input
                ref={regionRef}
                id="s3.region"
                name="s3.region"
                type="text"
                defaultValue={settings["s3.region"] ?? ""}
                placeholder={t("regionPlaceholder")}
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                style={inputStyle}
              />
              <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                {t("regionHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="s3.bucket"
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("bucketLabel")}
              </label>
              <input
                ref={bucketRef}
                id="s3.bucket"
                name="s3.bucket"
                type="text"
                defaultValue={settings["s3.bucket"] ?? ""}
                placeholder={t("bucketPlaceholder")}
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
                style={inputStyle}
              />
              <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                {t("bucketHint")}
              </p>
            </div>
          </div>

          {/* Access Key ID */}
          <div className="space-y-1.5">
            <label
              htmlFor="s3.access_key_id"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("accessKeyIdLabel")}
            </label>
            <input
              ref={accessKeyIdRef}
              id="s3.access_key_id"
              name="s3.access_key_id"
              type="text"
              defaultValue={settings["s3.access_key_id"] ?? ""}
              placeholder={t("accessKeyIdPlaceholder")}
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={inputStyle}
            />
          </div>

          {/* Secret Access Key */}
          <div className="space-y-1.5">
            <label
              htmlFor="s3.secret_access_key"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("secretLabel")}
            </label>
            <div className="relative">
              <input
                ref={secretRef}
                id="s3.secret_access_key"
                name="s3.secret_access_key"
                type={showSecret ? "text" : "password"}
                defaultValue={settings["s3.secret_access_key"] ?? ""}
                placeholder={secretMasked || t("secretPlaceholder")}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono"
                style={inputStyle}
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
              {t("secretHint")}
            </p>
          </div>

          {/* Backup Prefix */}
          <div className="space-y-1.5">
            <label
              htmlFor="s3.backup_prefix"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("prefixLabel")}
            </label>
            <input
              ref={prefixRef}
              id="s3.backup_prefix"
              name="s3.backup_prefix"
              type="text"
              defaultValue={settings["s3.backup_prefix"] ?? "backup/"}
              placeholder="backup/"
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("prefixHint")}
            </p>
          </div>

          {/* Info Box */}
          <div
            className="flex gap-3 px-4 py-3 rounded-lg text-xs"
            style={{
              background: "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))",
              border: "1px solid color-mix(in oklch, var(--admin-accent) 20%, transparent)",
            }}>
            <HardDrive
              size={14}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--admin-accent)" }}
            />
            <div className="space-y-1.5">
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine1")}
              </p>
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine2")}
              </p>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}>
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
            }}>
            {isTesting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            {isTesting ? t("testingButton") : t("testButton")}
          </button>
        </div>
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
