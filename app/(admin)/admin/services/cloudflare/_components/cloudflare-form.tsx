"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import {
  Camera,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  Save,
  Shield,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  saveAvatarR2Settings,
  saveCloudflareSettings,
  saveConfigR2Settings,
  saveR2AccountId,
  testAvatarR2,
  testCloudflareSettings,
  testConfigR2,
  type ActionState,
} from "../actions";

type ToastState = { message: string; type: "success" | "error" } | null;

export function CloudflareForm({ settings }: { settings: AppSettings }) {
  const [toast, setToast] = useState<ToastState>(null);

  return (
    <>
      <div className="space-y-5">
        <TurnstileCard settings={settings} onToast={setToast} />
        <R2StorageCard settings={settings} onToast={setToast} />
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

// ─────────────────────────────────────────────────────────────────────────
// Turnstile card (CAPTCHA — niente a che vedere con R2)
// ─────────────────────────────────────────────────────────────────────────

function TurnstileCard({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (t: ToastState) => void;
}) {
  const t = useTranslations("admin.services.cloudflare");
  const [showSecret, setShowSecret] = useState(false);
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

  useToastFromAction(saveState, onToast);
  useToastFromAction(testState, onToast);

  const secretMasked = settings.cf_turnstile_secret_key
    ? settings.cf_turnstile_secret_key.slice(0, 6) + "????????????????"
    : "";

  const turnstileFilled =
    Boolean(settings.cf_turnstile_site_key) && Boolean(settings.cf_turnstile_secret_key);

  function handleTest() {
    const fd = new FormData();
    fd.append("cf_turnstile_secret_key", secretKeyRef.current?.value ?? "");
    testAction(fd);
  }

  return (
    <form action={saveAction}>
      <Card>
        <CardHeader
          icon={<Shield size={16} style={{ color: "var(--admin-accent)" }} />}
          title={t("turnstileCardTitle")}
          statusOk={turnstileFilled}
          statusOkLabel={t("turnstileStatusConfigured")}
          statusKoLabel={t("turnstileStatusNotConfigured")}
        />

        <Field
          name="cf_turnstile_site_key"
          label={t("siteKeyLabel")}
          hint={t("siteKeyHint")}
          defaultValue={settings.cf_turnstile_site_key ?? ""}
          placeholder="0x4AAAAAAA…"
          inputRef={siteKeyRef}
        />

        <SecretField
          name="cf_turnstile_secret_key"
          label={t("secretKeyLabel")}
          hint={t("secretKeyHint")}
          defaultValue={settings.cf_turnstile_secret_key ?? ""}
          placeholder={secretMasked || "0x4AAAAAAA????????????????"}
          inputRef={secretKeyRef}
          showSecret={showSecret}
          onToggleShow={() => setShowSecret((v) => !v)}
          showAria={t("showSecretAria")}
          hideAria={t("hideSecretAria")}
        />

        <InfoBox accent>
          <p style={{ color: "var(--admin-text-muted)" }}>
            {t("infoBoxLine1Before")}{" "}
            <strong style={{ color: "var(--admin-text)" }}>{t("infoBoxBrand")}</strong>{" "}
            {t("infoBoxLine1After")}
          </p>
          <p style={{ color: "var(--admin-text-muted)" }}>
            {t("infoBoxLine2Before")}{" "}
            <span className="font-semibold" style={{ color: "var(--admin-accent)" }}>
              {t("infoBoxLine2Path")}
            </span>{" "}
            {t("infoBoxLine2After")} <span className="italic">{t("infoBoxLine2WidgetType")}</span>.
          </p>
        </InfoBox>

        <ButtonRow>
          <SaveButton isSaving={isSaving} saveLabel={t("saveButton")} savingLabel={t("savingButton")} />
          <TestButton
            type="button"
            onClick={handleTest}
            isTesting={isTesting}
            icon={<Shield size={15} />}
            testLabel={t("testButton")}
            testingLabel={t("testingButton")}
          />
        </ButtonRow>
      </Card>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// R2 Storage card — UNIFICATA: account_id + sub-section per bucket
// ─────────────────────────────────────────────────────────────────────────

function R2StorageCard({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (t: ToastState) => void;
}) {
  const t = useTranslations("admin.services.cloudflare.r2");
  const accountConfigured = Boolean(settings["storage.r2.account_id"]);

  return (
    <Card>
      <CardHeader
        icon={<HardDrive size={16} style={{ color: "var(--admin-accent)" }} />}
        title={t("title")}
        statusOk={accountConfigured}
        statusOkLabel={t("accountConfigured")}
        statusKoLabel={t("accountNotConfigured")}
      />
      <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
        {t("description")}
      </p>

      <R2AccountIdForm settings={settings} onToast={onToast} />

      <div className="space-y-3 pt-2">
        <ConfigR2SubCard settings={settings} onToast={onToast} />
        <AvatarR2SubCard settings={settings} onToast={onToast} />
      </div>
    </Card>
  );
}

// ─── R2 Account ID (chiave globale) ─────────────────────────────────────

function R2AccountIdForm({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (t: ToastState) => void;
}) {
  const t = useTranslations("admin.services.cloudflare.r2.accountId");
  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveR2AccountId,
    {},
  );
  useToastFromAction(saveState, onToast);

  return (
    <form action={saveAction} className="space-y-3 max-w-lg">
      <Field
        name="storage.r2.account_id"
        label={t("label")}
        hint={t("hint")}
        defaultValue={settings["storage.r2.account_id"] ?? ""}
        placeholder={t("placeholder")}
      />
      <div>
        <SaveButton
          isSaving={isSaving}
          saveLabel={t("saveButton")}
          savingLabel={t("savingButton")}
        />
      </div>
    </form>
  );
}

// ─── Config snapshot sub-card ───────────────────────────────────────────

function ConfigR2SubCard({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (t: ToastState) => void;
}) {
  const t = useTranslations("admin.services.cloudflare.r2.config");
  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveConfigR2Settings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testConfigR2,
    {},
  );
  useToastFromAction(saveState, onToast);
  useToastFromAction(testState, onToast);

  const r2SecretIsSet = Boolean(settings["storage.config.r2.secret_access_key"]);
  const allFilled =
    Boolean(settings["storage.r2.account_id"]) &&
    Boolean(settings["storage.config.r2.access_key_id"]) &&
    r2SecretIsSet &&
    Boolean(settings["storage.config.r2.bucket"]);

  return (
    <form action={saveAction}>
      <SubCard
        icon={<Database size={14} style={{ color: "var(--admin-accent)" }} />}
        title={t("title")}
        description={t("description")}
        statusOk={allFilled}
        statusOkLabel={t("statusConfigured")}
        statusKoLabel={t("statusNotConfigured")}
      >
        <div className="space-y-4 max-w-lg">
          <Field
            name="storage.config.r2.access_key_id"
            label={t("accessKeyIdLabel")}
            hint={t("accessKeyIdHint")}
            defaultValue={settings["storage.config.r2.access_key_id"] ?? ""}
            placeholder=""
          />
          <Field
            name="storage.config.r2.secret_access_key"
            label={t("secretLabel")}
            hint={t("secretHint")}
            defaultValue={r2SecretIsSet ? "********" : ""}
            placeholder=""
            type="password"
          />
          <Field
            name="storage.config.r2.bucket"
            label={t("bucketLabel")}
            hint={t("bucketHint")}
            defaultValue={settings["storage.config.r2.bucket"] ?? ""}
            placeholder={t("bucketPlaceholder")}
          />
        </div>

        <ButtonRow>
          <SaveButton
            isSaving={isSaving || isTesting}
            saveLabel={t("saveButton")}
            savingLabel={t("savingButton")}
          />
          <TestButton
            type="submit"
            formAction={testAction}
            isTesting={isSaving || isTesting}
            icon={<CheckCircle2 size={15} />}
            testLabel={t("testButton")}
            testingLabel={t("testingButton")}
          />
        </ButtonRow>
      </SubCard>
    </form>
  );
}

// ─── Avatar sub-card ────────────────────────────────────────────────────

function AvatarR2SubCard({
  settings,
  onToast,
}: {
  settings: AppSettings;
  onToast: (t: ToastState) => void;
}) {
  const t = useTranslations("admin.services.cloudflare.r2Avatar");
  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveAvatarR2Settings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testAvatarR2,
    {},
  );
  useToastFromAction(saveState, onToast);
  useToastFromAction(testState, onToast);

  const r2SecretIsSet = Boolean(settings["storage.avatar.r2.secret_access_key"]);
  const allFilled =
    Boolean(settings["storage.r2.account_id"]) &&
    Boolean(settings["storage.avatar.r2.access_key_id"]) &&
    r2SecretIsSet &&
    Boolean(settings["storage.avatar.r2.bucket"]) &&
    Boolean(settings["storage.avatar.r2.public_base_url"]);

  return (
    <form action={saveAction}>
      <SubCard
        icon={<Camera size={14} style={{ color: "var(--admin-accent)" }} />}
        title={t("title")}
        description={t("description")}
        statusOk={allFilled}
        statusOkLabel={t("statusConfigured")}
        statusKoLabel={t("statusNotConfigured")}
      >
        <div className="space-y-4 max-w-lg">
          <Field
            name="storage.avatar.r2.access_key_id"
            label={t("accessKeyIdLabel")}
            hint={t("accessKeyIdHint")}
            defaultValue={settings["storage.avatar.r2.access_key_id"] ?? ""}
            placeholder=""
          />
          <Field
            name="storage.avatar.r2.secret_access_key"
            label={t("secretLabel")}
            hint={t("secretHint")}
            defaultValue={r2SecretIsSet ? "********" : ""}
            placeholder=""
            type="password"
          />
          <Field
            name="storage.avatar.r2.bucket"
            label={t("bucketLabel")}
            hint={t("bucketHint")}
            defaultValue={settings["storage.avatar.r2.bucket"] ?? ""}
            placeholder={t("bucketPlaceholder")}
          />
          <Field
            name="storage.avatar.r2.public_base_url"
            label={t("publicBaseLabel")}
            hint={t("publicBaseHint")}
            defaultValue={settings["storage.avatar.r2.public_base_url"] ?? ""}
            placeholder={t("publicBasePlaceholder")}
          />
        </div>

        <ButtonRow>
          <SaveButton
            isSaving={isSaving || isTesting}
            saveLabel={t("saveButton")}
            savingLabel={t("savingButton")}
          />
          <TestButton
            type="submit"
            formAction={testAction}
            isTesting={isSaving || isTesting}
            icon={<CheckCircle2 size={15} />}
            testLabel={t("testButton")}
            testingLabel={t("testingButton")}
          />
        </ButtonRow>
      </SubCard>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Primitives — riusabili per non duplicare classi Tailwind/style admin
// ─────────────────────────────────────────────────────────────────────────

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-xl shadow-sm p-6 space-y-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      {children}
    </div>
  );
}

function SubCard({
  icon,
  title,
  description,
  statusOk,
  statusOkLabel,
  statusKoLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  statusOk: boolean;
  statusOkLabel: string;
  statusKoLabel: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-5 space-y-4"
      style={{
        background: "color-mix(in oklch, var(--admin-page-bg) 50%, var(--admin-card-bg))",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            {title}
          </h4>
        </div>
        <StatusBadge ok={statusOk} okLabel={statusOkLabel} koLabel={statusKoLabel} />
      </div>
      {description && (
        <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  title,
  statusOk,
  statusOkLabel,
  statusKoLabel,
}: {
  icon: ReactNode;
  title: string;
  statusOk: boolean;
  statusOkLabel: string;
  statusKoLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          {title}
        </h3>
      </div>
      <StatusBadge ok={statusOk} okLabel={statusOkLabel} koLabel={statusKoLabel} />
    </div>
  );
}

function StatusBadge({
  ok,
  okLabel,
  koLabel,
}: {
  ok: boolean;
  okLabel: string;
  koLabel: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        background: ok
          ? "color-mix(in srgb, var(--gc-pos, #16a34a) 15%, transparent)"
          : "color-mix(in srgb, var(--admin-text-faint) 15%, transparent)",
        color: ok ? "var(--gc-pos, #16a34a)" : "var(--admin-text-faint)",
      }}
    >
      {ok ? okLabel : koLabel}
    </span>
  );
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  type = "text",
  inputRef,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  placeholder: string;
  type?: "text" | "password";
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--admin-text-muted)" }}
      >
        {label}
      </label>
      <input
        ref={inputRef}
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

function SecretField({
  name,
  label,
  hint,
  defaultValue,
  placeholder,
  inputRef,
  showSecret,
  onToggleShow,
  showAria,
  hideAria,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  showSecret: boolean;
  onToggleShow: () => void;
  showAria: string;
  hideAria: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--admin-text-muted)" }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={name}
          name={name}
          type={showSecret ? "text" : "password"}
          defaultValue={defaultValue}
          placeholder={placeholder}
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
          aria-label={showSecret ? hideAria : showAria}
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
          style={{ color: "var(--admin-text-muted)" }}
        >
          {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}

function InfoBox({
  accent,
  children,
}: {
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="flex gap-3 px-4 py-3 rounded-lg text-xs"
      style={{
        background: accent
          ? "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))"
          : "var(--admin-page-bg)",
        border: accent
          ? "1px solid color-mix(in oklch, var(--admin-accent) 20%, transparent)"
          : "1px solid var(--admin-card-border)",
      }}
    >
      <Shield size={14} className="shrink-0 mt-0.5" style={{ color: "var(--admin-accent)" }} />
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3">{children}</div>;
}

function SaveButton({
  isSaving,
  saveLabel,
  savingLabel,
}: {
  isSaving: boolean;
  saveLabel: string;
  savingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={isSaving}
      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ background: "var(--admin-accent)" }}
    >
      {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
      {isSaving ? savingLabel : saveLabel}
    </button>
  );
}

function TestButton({
  type = "button",
  onClick,
  formAction,
  isTesting,
  icon,
  testLabel,
  testingLabel,
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  formAction?: (formData: FormData) => void;
  isTesting: boolean;
  icon: ReactNode;
  testLabel: string;
  testingLabel: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      formAction={formAction}
      disabled={isTesting}
      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "var(--admin-hover-bg)",
        color: "var(--admin-text)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      {isTesting ? <Loader2 size={15} className="animate-spin" /> : icon}
      {isTesting ? testingLabel : testLabel}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Toast hook: shared logic per propagare action result al parent toast.
// ─────────────────────────────────────────────────────────────────────────

function useToastFromAction(state: ActionState, onToast: (t: ToastState) => void) {
  const lastTs = useRef<number>(0);
  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state) onToast({ message: state.success, type: "success" });
    if ("error" in state) onToast({ message: state.error, type: "error" });
  }, [state, onToast]);
}
