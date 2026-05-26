"use client";
// app/(admin)/admin/modules/notifications/settings/_components/settings-form.tsx
//
// Form delle settings del modulo notifications: legacy (dedup window,
// page size, retention) + achievement viral_* (likes/comments/reposts).
// Stile input via `adminFieldStyle` standard (admin-dialog.tsx) →
// sfondo --admin-page-bg che contrasta con la card --admin-card-bg.
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { adminFieldStyle } from "@/app/(admin)/admin/_components/admin-dialog";
import { saveNotificationsSettings, type SettingsSaveResult } from "../actions";

// Variante più stretta per i NumberField (default è width: 100%)
const numberFieldStyle: React.CSSProperties = {
  ...adminFieldStyle,
  maxWidth: 220,
};

export type NotificationsSettingsInitial = {
  dedupWindowMinutes: number;
  listPageSize: number;
  retentionDays: number;
  viralLikesEnabled: boolean;
  viralLikesThreshold: number;
  viralLikesWindowHours: number;
  viralCommentsEnabled: boolean;
  viralCommentsThreshold: number;
  viralCommentsWindowHours: number;
  viralRepostsEnabled: boolean;
  viralRepostsThreshold: number;
  viralRepostsWindowHours: number;
  emailSendEnabled: boolean;
  emailGraceSeconds: number;
};

export function NotificationsSettingsForm({
  initial,
}: {
  initial: NotificationsSettingsInitial;
}) {
  const t = useTranslations("notifications.admin.settings");
  const [state, formAction, pending] = useActionState<
    SettingsSaveResult | null,
    FormData
  >(saveNotificationsSettings, null);

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[var(--admin-text)]">
            {t("title")}
          </h2>
        </header>

        <NumberField
          name="dedup_window_minutes"
          label={t("dedup_window_minutes_label")}
          help={t("dedup_window_minutes_help")}
          defaultValue={initial.dedupWindowMinutes}
          min={1}
          max={1440}
        />

        <NumberField
          name="list_page_size"
          label={t("list_page_size_label")}
          help={t("list_page_size_help")}
          defaultValue={initial.listPageSize}
          min={5}
          max={100}
        />

        <NumberField
          name="retention_days"
          label={t("retention_days_label")}
          help={t("retention_days_help")}
          defaultValue={initial.retentionDays}
          min={7}
          max={3650}
        />
      </section>

      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[var(--admin-text)]">
            {t("achievements_section_title")}
          </h2>
          <p className="text-sm text-[var(--admin-text-muted)] mt-0.5">
            {t("achievements_section_help")}
          </p>
        </header>

        <CheckboxField
          name="viral_likes_enabled"
          label={t("viral_likes_enabled_label")}
          help={t("viral_likes_enabled_help")}
          defaultChecked={initial.viralLikesEnabled}
        />

        <NumberField
          name="viral_likes_threshold"
          label={t("viral_likes_threshold_label")}
          help={t("viral_likes_threshold_help")}
          defaultValue={initial.viralLikesThreshold}
          min={1}
          max={10000}
        />

        <NumberField
          name="viral_likes_window_hours"
          label={t("viral_likes_window_hours_label")}
          help={t("viral_likes_window_hours_help")}
          defaultValue={initial.viralLikesWindowHours}
          min={1}
          max={720}
        />

        <div className="border-t border-[var(--admin-card-border)] pt-4" />

        <CheckboxField
          name="viral_comments_enabled"
          label={t("viral_comments_enabled_label")}
          help={t("viral_comments_enabled_help")}
          defaultChecked={initial.viralCommentsEnabled}
        />

        <NumberField
          name="viral_comments_threshold"
          label={t("viral_comments_threshold_label")}
          help={t("viral_comments_threshold_help")}
          defaultValue={initial.viralCommentsThreshold}
          min={1}
          max={10000}
        />

        <NumberField
          name="viral_comments_window_hours"
          label={t("viral_comments_window_hours_label")}
          help={t("viral_comments_window_hours_help")}
          defaultValue={initial.viralCommentsWindowHours}
          min={1}
          max={720}
        />

        <div className="border-t border-[var(--admin-card-border)] pt-4" />

        <CheckboxField
          name="viral_reposts_enabled"
          label={t("viral_reposts_enabled_label")}
          help={t("viral_reposts_enabled_help")}
          defaultChecked={initial.viralRepostsEnabled}
        />

        <NumberField
          name="viral_reposts_threshold"
          label={t("viral_reposts_threshold_label")}
          help={t("viral_reposts_threshold_help")}
          defaultValue={initial.viralRepostsThreshold}
          min={1}
          max={10000}
        />

        <NumberField
          name="viral_reposts_window_hours"
          label={t("viral_reposts_window_hours_label")}
          help={t("viral_reposts_window_hours_help")}
          defaultValue={initial.viralRepostsWindowHours}
          min={1}
          max={720}
        />
      </section>

      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[var(--admin-text)]">
            {t("email_section_title")}
          </h2>
          <p className="text-sm text-[var(--admin-text-muted)] mt-0.5">
            {t("email_section_help")}
          </p>
        </header>

        <CheckboxField
          name="email_send_enabled"
          label={t("email_send_enabled_label")}
          help={t("email_send_enabled_help")}
          defaultChecked={initial.emailSendEnabled}
        />

        <NumberField
          name="email_grace_seconds"
          label={t("email_grace_seconds_label")}
          help={t("email_grace_seconds_help")}
          defaultValue={initial.emailGraceSeconds}
          min={0}
          max={3600}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-[var(--admin-accent)] text-white text-sm font-medium hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("save")}
        </button>
        {state?.ok ? (
          <span className="text-xs text-emerald-600">{t("saved")}</span>
        ) : null}
        {state?.ok === false ? (
          <span className="text-xs text-rose-600">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  help,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  help: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[var(--admin-text)] mb-1">
        {label}
      </span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        style={numberFieldStyle}
      />
      <span className="block text-xs text-[var(--admin-text-muted)] mt-1">
        {help}
      </span>
    </label>
  );
}

function CheckboxField({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
        style={{
          background: "var(--admin-page-bg)",
          borderColor: "var(--admin-input-border)",
        }}
      />
      <span className="block">
        <span className="block text-sm font-medium text-[var(--admin-text)]">
          {label}
        </span>
        <span className="block text-xs text-[var(--admin-text-muted)] mt-0.5">
          {help}
        </span>
      </span>
    </label>
  );
}
