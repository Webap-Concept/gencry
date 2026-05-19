"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { Save, Loader2, Key } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveSettingsAction, type ActionState } from "../../actions";

type ToastState = { message: string; type: "success" | "error" } | null;

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    saveSettingsAction,
    {},
  );
  const lastTs = useRef(0);
  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state) setToast({ message: state.success, type: "success" });
    if ("error" in state) setToast({ message: state.error, type: "error" });
  }, [state]);

  const apiKeyIsSet = Boolean(settings["modules.news.anthropic_api_key"]);

  return (
    <>
      <form
        action={action}
        className="rounded-xl p-6 space-y-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
      >
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--admin-text)" }}>
            Pipeline tunables
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            Capacity profile presets (alpha → scale) live in the module manifest. The fields below
            are the values currently applied — adjust manually for fine-tuning, or pick a preset
            from the capacity dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <NumberField
            name="rewriteBatchSize"
            label="Rewrite batch size"
            defaultValue={settings["modules.news.rewrite_batch_size"]}
            hint="Items processed per rewrite cron run"
          />
          <NumberField
            name="publisherBatchSize"
            label="Publisher batch size"
            defaultValue={settings["modules.news.publisher_batch_size"]}
            hint="Items published per publisher cron run"
          />
          <NumberField
            name="maxPublishedPerDay"
            label="Max published per day"
            defaultValue={settings["modules.news.max_published_per_day"]}
            hint="UI guardrail when scheduling"
          />
          <NumberField
            name="rewriteMaxAttempts"
            label="Rewrite max attempts"
            defaultValue={settings["modules.news.rewrite_max_attempts"]}
            hint="LLM retries before marking as failed"
          />
          <NumberField
            name="fetchMaxItemsPerSource"
            label="Fetch max items per source"
            defaultValue={settings["modules.news.fetch_max_items_per_source"]}
            hint="Anti-overload cap per ingestion run"
          />
          <SelectField
            name="aiModel"
            label="AI model"
            defaultValue={settings["modules.news.ai_model"]}
            hint="Sonnet ≈ $0.02/article, Haiku ≈ $0.005/article (lower quality)"
            options={[
              { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
              { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (cheaper)" },
            ]}
          />
        </div>

        <div className="pt-3 border-t" style={{ borderColor: "var(--admin-card-border)" }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--admin-text)" }}>
            <Key size={14} style={{ color: "var(--admin-accent)" }} />
            Anthropic API key
          </h3>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--admin-text-muted)" }}>
            Required for the rewriter cron. Get one from{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
              style={{ color: "var(--admin-accent)" }}
            >
              console.anthropic.com
            </a>
            . Leave the masked placeholder unchanged to keep the saved value.
          </p>
          <input
            name="anthropicApiKey"
            type="password"
            autoComplete="off"
            defaultValue={apiKeyIsSet ? "********" : ""}
            placeholder="sk-ant-api03-…"
            className="w-full max-w-xl px-3 py-2 rounded-lg text-sm font-mono"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--admin-accent)" }}
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {isPending ? "Saving…" : "Save settings"}
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

function NumberField({
  name,
  label,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </label>
      <input
        name={name}
        type="number"
        defaultValue={defaultValue}
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text)",
        }}
      />
      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
        {hint}
      </p>
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  hint,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  hint: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
        {hint}
      </p>
    </div>
  );
}
