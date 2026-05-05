// app/(admin)/admin/settings/tabs/general-tab.tsx
"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { Globe, ImageIcon, Loader2, Save, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  removeBrandingAssetAction,
  saveAppSettings,
  uploadBrandingAssetAction,
  type ActionState,
} from "../actions";

export function GeneralTab({ settings }: { settings: AppSettings }) {
  const pathname = usePathname();
  return <GeneralTabInner key={pathname} settings={settings} />;
}

function GeneralTabInner({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.settings.general");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAppSettings,
    {},
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
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

  const cleanDomain = (settings.app_domain ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  return (
    <>
      <div className="space-y-5">
        <form action={formAction} className="space-y-5">
          <div
            className="rounded-xl shadow-sm p-6"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}>
            <h3
              className="text-sm font-semibold mb-5"
              style={{ color: "var(--admin-text)" }}>
              {t("appIdentityTitle")}
            </h3>

            <div className="space-y-4 max-w-lg">
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("appNameLabel")}
                </label>
                <input
                  name="app_name"
                  defaultValue={settings.app_name}
                  maxLength={60}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}
                />
                <p
                  className="text-[11px] mt-1"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("appNameHint")}
                </p>
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("appDescLabel")}
                </label>
                <textarea
                  name="app_description"
                  defaultValue={settings.app_description}
                  maxLength={160}
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors resize-none"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}
                />
                <p
                  className="text-[11px] mt-1"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("appDescHint")}
                </p>
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "var(--admin-text-muted)" }}>
                  <span className="flex items-center gap-1.5">
                    <Globe size={12} />
                    {t("domainLabel")}
                  </span>
                </label>
                <div
                  className="flex items-center rounded-lg overflow-hidden"
                  style={{
                    border: "1px solid var(--admin-input-border)",
                  }}>
                  <span
                    className="px-3 py-2 text-sm select-none shrink-0"
                    style={{
                      background: "var(--admin-hover-bg)",
                      color: "var(--admin-text-faint)",
                      borderRight: "1px solid var(--admin-input-border)",
                    }}>
                    https://
                  </span>
                  <input
                    name="app_domain"
                    defaultValue={cleanDomain}
                    maxLength={253}
                    placeholder={t("domainPlaceholder")}
                    className="flex-1 px-3 py-2 text-sm focus:outline-none transition-colors"
                    style={{
                      background: "var(--admin-page-bg)",
                      color: "var(--admin-text)",
                    }}
                  />
                </div>
                <p
                  className="text-[11px] mt-1"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("domainHintBefore")}{" "}
                  <code className="font-mono">example.com</code>{" "}
                  {t("domainHintMiddleOr")}{" "}
                  <code className="font-mono">app.example.com</code>
                  {t("domainHintAfterPrefix")}{" "}
                  <code className="font-mono">https://</code>{" "}
                  {t("domainHintAfterSuffix")}
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) =>
              !isPending &&
              (e.currentTarget.style.background = "var(--admin-accent-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--admin-accent)")
            }>
            {isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {isPending ? t("saving") : t("save")}
          </button>
        </form>

        <BrandAssetsCard settings={settings} onToast={setToast} />
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

// ---------------------------------------------------------------------------
// Brand assets card
// ---------------------------------------------------------------------------

type ToastSetter = React.Dispatch<
  React.SetStateAction<{ message: string; type: "success" | "error" } | null>
>;

const BRAND_SLOTS = [
  {
    slot: "logo" as const,
    settingKey: "app_logo_url" as const,
    accept: "image/png,image/jpeg,image/svg+xml,image/webp",
  },
  {
    slot: "logo-variant" as const,
    settingKey: "app_logo_variant_url" as const,
    accept: "image/png,image/jpeg,image/svg+xml,image/webp",
  },
  {
    slot: "favicon" as const,
    settingKey: "app_favicon_url" as const,
    accept: "image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon",
  },
];

function BrandAssetsCard({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: ToastSetter;
}) {
  const t = useTranslations("admin.settings.general");
  return (
    <div
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon size={14} style={{ color: "var(--admin-text)" }} />
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {t("brandAssetsTitle")}
        </h3>
      </div>
      <p
        className="text-[11px] mb-5"
        style={{ color: "var(--admin-text-faint)" }}>
        {t("brandAssetsHint")}
      </p>

      <div className="space-y-4">
        {BRAND_SLOTS.map((s) => (
          <BrandAssetRow
            key={s.slot}
            slot={s.slot}
            accept={s.accept}
            currentUrl={settings[s.settingKey]}
            onToast={onToast}
          />
        ))}
      </div>
    </div>
  );
}

function BrandAssetRow({
  slot,
  accept,
  currentUrl,
  onToast,
}: {
  slot: "logo" | "logo-variant" | "favicon";
  accept: string;
  currentUrl: string | null;
  onToast: ToastSetter;
}) {
  const t = useTranslations("admin.settings.general");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const label = t(`slots.${slot}.label`);
  const hint = t(`slots.${slot}.hint`);

  const [uploadState, uploadAction, uploading] = useActionState<
    ActionState,
    FormData
  >(uploadBrandingAssetAction, {});
  const [removeState, removeAction, removing] = useActionState<
    ActionState,
    FormData
  >(removeBrandingAssetAction, {});

  const lastUploadTs = useRef<number>(0);
  const lastRemoveTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in uploadState)) return;
    if (uploadState.timestamp === lastUploadTs.current) return;
    lastUploadTs.current = uploadState.timestamp;
    if ("success" in uploadState && uploadState.success) {
      onToast({ message: uploadState.success, type: "success" });
      router.refresh();
    }
    if ("error" in uploadState && uploadState.error)
      onToast({ message: uploadState.error, type: "error" });
  }, [uploadState, onToast, router]);

  useEffect(() => {
    if (!("timestamp" in removeState)) return;
    if (removeState.timestamp === lastRemoveTs.current) return;
    lastRemoveTs.current = removeState.timestamp;
    if ("success" in removeState && removeState.success) {
      onToast({ message: removeState.success, type: "success" });
      router.refresh();
    }
    if ("error" in removeState && removeState.error)
      onToast({ message: removeState.error, type: "error" });
  }, [removeState, onToast, router]);

  const busy = uploading || removing;

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("slot", slot);
    fd.set("file", file);
    uploadAction(fd);
    e.target.value = "";
  }

  return (
    <div
      className="flex items-center gap-4 p-3 rounded-lg"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-input-border)",
      }}>
      <div
        className="w-20 h-20 rounded-lg flex items-center justify-center shrink-0 overflow-hidden p-2"
        style={{
          background: currentUrl
            ? "repeating-conic-gradient(var(--admin-card-bg) 0% 25%, var(--admin-page-bg) 0% 50%) 50% / 16px 16px"
            : "var(--admin-card-bg)",
          border: "1px solid var(--admin-input-border)",
        }}>
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={label}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageIcon size={24} style={{ color: "var(--admin-text-faint)" }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {label}
        </p>
        <p
          className="text-[11px]"
          style={{ color: "var(--admin-text-faint)" }}>
          {hint}
        </p>
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono break-all underline mt-0.5 inline-block"
            style={{ color: "var(--admin-accent)" }}>
            {currentUrl.split("/").pop()}
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={onFilePicked}
          className="hidden"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "var(--admin-accent)",
            color: "#fff",
          }}>
          {uploading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          {uploading
            ? t("uploading")
            : currentUrl
              ? t("replace")
              : t("upload")}
        </button>

        {currentUrl && (
          <form action={removeAction}>
            <input type="hidden" name="slot" value={slot} />
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: "transparent",
                color: "var(--admin-text-muted)",
                border: "1px solid var(--admin-input-border)",
              }}
              title={t("removeTitle")}>
              {removing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
