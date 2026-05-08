"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type { AppSettings } from "@/lib/db/settings-queries";
import { ArrowRight, Loader2, Save, Shield, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveModeSettings, type ActionState } from "../actions";
import { SettingToggle } from "../toggles";

export function ModeTab({ settings }: { settings: AppSettings }) {
  const pathname = usePathname();
  return <ModeTabInner key={pathname} settings={settings} />;
}

function ModeTabInner({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.settings.mode");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveModeSettings,
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

  return (
    <>
      <form action={formAction} className="space-y-5">
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--admin-text)" }}>
            {t("cardTitle")}
          </h3>

          <div
            className="max-w-lg divide-y"
            style={{ borderTop: "1px solid var(--admin-divider)" }}>
            <SettingToggle
              name="registrations_enabled"
              label={t("registrationsLabel")}
              description={t("registrationsDescription")}
              defaultValue={settings.registrations_enabled === "true"}
              activeColor="bg-green-500"
            />
            <SettingToggle
              name="maintenance_mode"
              label={t("maintenanceLabel")}
              description={t("maintenanceDescription")}
              defaultValue={settings.maintenance_mode === "true"}
              activeColor="bg-red-500"
            />
          </div>

          <TurnstileStatus
            configured={Boolean(
              settings.cf_turnstile_site_key && settings.cf_turnstile_secret_key,
            )}
          />
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

function TurnstileStatus({ configured }: { configured: boolean }) {
  const t = useTranslations("admin.settings.mode");
  const adminSlug = useAdminSlug();
  const cloudflareHref = buildAdminPathFromSlug(adminSlug, "/services/cloudflare");
  const accent = configured
    ? "color-mix(in oklch, var(--admin-accent) 20%, transparent)"
    : "rgba(217,119,6,0.35)";
  const tint = configured
    ? "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))"
    : "rgba(217,119,6,0.06)";
  const iconColor = configured ? "var(--admin-accent)" : "#d97706";
  const Icon = configured ? Shield : ShieldOff;

  return (
    <div
      className="max-w-lg mt-4 flex gap-3 px-4 py-3 rounded-lg text-xs"
      style={{
        background: tint,
        border: `1px solid ${accent}`,
      }}>
      <Icon size={14} className="shrink-0 mt-0.5" style={{ color: iconColor }} />
      <div className="flex-1 space-y-1.5">
        <p style={{ color: "var(--admin-text-muted)" }}>
          {t("turnstileText")}{" "}
          <strong style={{ color: "var(--admin-text)" }}>
            {t("turnstileBrand")}
          </strong>
          {configured ? (
            <>
              {" "}—{" "}
              <span style={{ color: iconColor, fontWeight: 600 }}>
                {t("turnstileActive")}
              </span>
              .
            </>
          ) : (
            <>
              {" "}—{" "}
              <span style={{ color: iconColor, fontWeight: 600 }}>
                {t("turnstileNotConfigured")}
              </span>
              : {t("turnstileNotConfiguredHint")}
            </>
          )}
        </p>
        <Link
          href={cloudflareHref}
          className="inline-flex items-center gap-1 font-medium transition-opacity hover:opacity-80"
          style={{ color: iconColor }}>
          {configured ? t("manageKeys") : t("configureKeys")}
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
