"use client";
// app/(admin)/admin/modules/notifications/settings/_components/settings-form.tsx
//
// Form delle 3 settings del modulo notifications: dedup window, page
// size, retention. Pattern minimalista (no AdminButton/AdminInput
// custom per ora — coerente col scaffold light di altri moduli, da
// uniformare se il modulo cresce).
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveNotificationsSettings, type SettingsSaveResult } from "../actions";

export type NotificationsSettingsInitial = {
  dedupWindowMinutes: number;
  listPageSize: number;
  retentionDays: number;
  firstLikeEnabled: boolean;
  viralLikesEnabled: boolean;
  viralLikesThreshold: number;
  viralLikesWindowHours: number;
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
    <form action={formAction} className="space-y-5 max-w-xl">
      <h1 className="text-lg font-semibold text-[var(--admin-fg)]">
        {t("title")}
      </h1>

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

      <fieldset className="border border-[var(--admin-line)] rounded-lg p-4 space-y-4">
        <legend className="px-2 text-sm font-semibold text-[var(--admin-fg)]">
          {t("achievements_section_title")}
        </legend>
        <p className="text-xs text-[var(--admin-fg-3)] -mt-2">
          {t("achievements_section_help")}
        </p>

        <CheckboxField
          name="first_like_enabled"
          label={t("first_like_enabled_label")}
          help={t("first_like_enabled_help")}
          defaultChecked={initial.firstLikeEnabled}
        />

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
      </fieldset>

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
      <span className="block text-sm font-medium text-[var(--admin-fg)] mb-1">
        {label}
      </span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        className="w-full max-w-[200px] rounded-md border border-[var(--admin-line)] bg-[var(--admin-bg)] px-3 py-2 text-sm text-[var(--admin-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]"
      />
      <span className="block text-xs text-[var(--admin-fg-3)] mt-1">{help}</span>
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
        className="mt-0.5 h-4 w-4 rounded border-[var(--admin-line)] text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
      />
      <span className="block">
        <span className="block text-sm font-medium text-[var(--admin-fg)]">
          {label}
        </span>
        <span className="block text-xs text-[var(--admin-fg-3)] mt-0.5">
          {help}
        </span>
      </span>
    </label>
  );
}
