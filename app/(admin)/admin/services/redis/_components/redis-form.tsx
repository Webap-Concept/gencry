"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { Eye, EyeOff, Loader2, Save, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveRedisSettings,
  testRedisConnection,
  type ActionState,
} from "../actions";

export function RedisForm({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.services.redis");
  const [showToken, setShowToken] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const urlRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, isSaving] = useActionState<
    ActionState,
    FormData
  >(saveRedisSettings, {});
  const [testState, testAction, isTesting] = useActionState<
    ActionState,
    FormData
  >(testRedisConnection, {});

  const lastSaveTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState)
      setToast({ message: saveState.success, type: "success" });
    if ("error" in saveState)
      setToast({ message: saveState.error, type: "error" });
  }, [saveState]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState)
      setToast({ message: testState.success, type: "success" });
    if ("error" in testState)
      setToast({ message: testState.error, type: "error" });
  }, [testState]);

  const tokenMasked = settings.upstash_redis_rest_token
    ? settings.upstash_redis_rest_token.slice(0, 8) + "????????????????"
    : "";

  function handleTest() {
    const fd = new FormData();
    fd.append("upstash_redis_rest_url", urlRef.current?.value ?? "");
    fd.append("upstash_redis_rest_token", tokenRef.current?.value ?? "");
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
              htmlFor="upstash_redis_rest_url"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("urlLabel")}
            </label>
            <input
              ref={urlRef}
              id="upstash_redis_rest_url"
              name="upstash_redis_rest_url"
              type="url"
              defaultValue={settings.upstash_redis_rest_url ?? ""}
              placeholder="https://your-db.upstash.io"
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
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--admin-accent)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--admin-input-border)")
              }
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("urlHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="upstash_redis_rest_token"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("tokenLabel")}
            </label>
            <div className="relative">
              <input
                ref={tokenRef}
                id="upstash_redis_rest_token"
                name="upstash_redis_rest_token"
                type={showToken ? "text" : "password"}
                defaultValue={settings.upstash_redis_rest_token ?? ""}
                placeholder={tokenMasked || "AX????????????????"}
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
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--admin-accent)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor =
                    "var(--admin-input-border)")
                }
              />
              <button
                type="button"
                aria-label={showToken ? t("hideTokenAria") : t("showTokenAria")}
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                style={{ color: "var(--admin-text-muted)" }}>
                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("tokenHint")}
            </p>
          </div>
        </div>

        {/* Action Buttons: Save + Test */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) =>
              !isSaving &&
              (e.currentTarget.style.background = "var(--admin-accent-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--admin-accent)")
            }>
            {isSaving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
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
              (e.currentTarget.style.background =
                "var(--admin-sidebar-item-hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--admin-hover-bg)")
            }>
            {isTesting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Wifi size={15} />
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
