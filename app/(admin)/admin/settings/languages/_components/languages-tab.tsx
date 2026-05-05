"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppLocale } from "@/lib/db/schema";
import { AlertTriangle, Check, Lock, Save, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  saveLocaleMetadataAction,
  toggleLocaleAction,
  type ActionState,
} from "../actions";

type Props = {
  locales: AppLocale[];
  envDefault: string;
  dbDefaultCode: string | null;
};

export function LanguagesTab({ locales, envDefault, dbDefaultCode }: Props) {
  const [metaState, metaAction, metaPending] = useActionState<
    ActionState,
    FormData
  >(saveLocaleMetadataAction, {});

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in metaState)) return;
    if (metaState.timestamp === lastTs.current) return;
    lastTs.current = metaState.timestamp;
    if ("success" in metaState && metaState.success) {
      setToast({ message: metaState.success, type: "success" });
    }
    if ("error" in metaState && metaState.error) {
      setToast({ message: metaState.error, type: "error" });
    }
  }, [metaState]);

  const envDbMismatch =
    dbDefaultCode !== null && dbDefaultCode !== envDefault;

  return (
    <>
      <div className="space-y-5">
        {/* Card info: default readonly + warning env↔DB ─────────────────── */}
        <div
          className="rounded-xl shadow-sm p-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-3 flex items-center gap-2"
            style={{ color: "var(--admin-text)" }}>
            <Lock size={14} />
            Default locale (read-only)
          </h3>
          <p
            className="text-xs mb-3"
            style={{ color: "var(--admin-text-muted)" }}>
            The default locale is set at deploy time via the{" "}
            <code
              className="px-1 py-0.5 rounded text-[11px]"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
              }}>
              I18N_DEFAULT_LOCALE
            </code>{" "}
            environment variable. It cannot be changed from the admin UI:
            modifying it post-deploy has SEO impact (URLs without locale
            prefix would change content). Contact your developer to switch
            the default.
          </p>
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <span
              className="font-mono uppercase tracking-wider text-[11px]">
              {envDefault}
            </span>
            <span style={{ color: "var(--admin-text-muted)" }}>
              from <code className="text-[11px]">I18N_DEFAULT_LOCALE</code>
            </span>
          </div>

          {envDbMismatch && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-lg text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <AlertTriangle
                size={14}
                className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              />
              <div style={{ color: "var(--admin-text)" }}>
                <strong>Env / DB default mismatch.</strong> Environment says{" "}
                <code>{envDefault}</code> but the database default is{" "}
                <code>{dbDefaultCode}</code>. The proxy and i18n loader use
                the env value. To realign the database, run in Supabase:
                <pre
                  className="mt-2 p-2 rounded text-[11px] font-mono overflow-x-auto"
                  style={{
                    background: "var(--admin-page-bg)",
                    color: "var(--admin-text-muted)",
                  }}>
{`UPDATE app_locales SET is_default = (code = '${envDefault}');`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Card lista locale ──────────────────────────────────────────────── */}
        <form action={metaAction}>
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
                Available locales
              </h3>
              <button
                type="submit"
                disabled={metaPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--admin-accent)",
                  color: "white",
                }}>
                <Save size={12} />
                {metaPending ? "Saving…" : "Save metadata"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-[11px] uppercase tracking-wider"
                    style={{ color: "var(--admin-text-faint)" }}>
                    <th className="pb-3 pr-4 font-medium">Code</th>
                    <th className="pb-3 pr-4 font-medium">Label</th>
                    <th className="pb-3 pr-4 font-medium">Native label</th>
                    <th className="pb-3 pr-4 font-medium">Sort</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {locales.map((locale) => (
                    <LocaleRow
                      key={locale.code}
                      locale={locale}
                      envDefault={envDefault}
                      onToggleResult={(msg, ok) =>
                        setToast({
                          message: msg,
                          type: ok ? "success" : "error",
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
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

function LocaleRow({
  locale,
  envDefault,
  onToggleResult,
}: {
  locale: AppLocale;
  envDefault: string;
  onToggleResult: (message: string, ok: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [enabledLocal, setEnabledLocal] = useState(locale.enabled);
  const isEnvDefault = locale.code === envDefault;

  // Sincronizza con prop quando il server revalida il path
  useEffect(() => {
    setEnabledLocal(locale.enabled);
  }, [locale.enabled]);

  const handleToggle = () => {
    const next = !enabledLocal;
    const formData = new FormData();
    formData.append("code", locale.code);
    formData.append("enabled", String(next));
    setEnabledLocal(next);
    startTransition(async () => {
      const result = await toggleLocaleAction({}, formData);
      if ("error" in result && result.error) {
        // Rollback ottimistico
        setEnabledLocal(!next);
        onToggleResult(result.error, false);
      } else if ("success" in result && result.success) {
        onToggleResult(result.success, true);
      }
    });
  };

  return (
    <tr
      style={{
        borderTop: "1px solid var(--admin-card-border)",
      }}>
      <td className="py-3 pr-4">
        <code
          className="text-xs font-mono uppercase tracking-wider"
          style={{ color: "var(--admin-text)" }}>
          {locale.code}
        </code>
      </td>
      <td
        className="py-3 pr-4"
        style={{ color: "var(--admin-text-muted)" }}>
        {locale.label}
      </td>
      <td className="py-3 pr-4">
        <input
          name={`label_${locale.code}`}
          defaultValue={locale.nativeLabel}
          maxLength={64}
          className="w-full max-w-[180px] px-2 py-1 text-sm rounded focus:outline-none transition-colors"
          style={{
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-input-border)",
            color: "var(--admin-text)",
          }}
        />
      </td>
      <td className="py-3 pr-4">
        <input
          type="number"
          name={`sort_${locale.code}`}
          defaultValue={locale.sortOrder}
          className="w-20 px-2 py-1 text-sm rounded focus:outline-none transition-colors"
          style={{
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-input-border)",
            color: "var(--admin-text)",
          }}
        />
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 flex-wrap">
          {isEnvDefault && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium"
              style={{
                background:
                  "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
              }}>
              <Lock size={9} />
              default
            </span>
          )}
          {enabledLocal ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Check size={9} />
              enabled
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium"
              style={{
                background:
                  "color-mix(in srgb, var(--admin-text-faint) 12%, transparent)",
                color: "var(--admin-text-faint)",
              }}>
              <X size={9} />
              disabled
            </span>
          )}
        </div>
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending || isEnvDefault}
          title={
            isEnvDefault
              ? "Default locale cannot be disabled"
              : enabledLocal
                ? "Disable this locale"
                : "Enable this locale"
          }
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-input-border)",
            color: "var(--admin-text)",
          }}>
          {pending ? "…" : enabledLocal ? "Disable" : "Enable"}
        </button>
      </td>
    </tr>
  );
}
