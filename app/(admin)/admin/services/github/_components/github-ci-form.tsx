"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { AppSettings } from "@/lib/db/settings-queries";
import { Eye, EyeOff, GitMerge, Loader2, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveGitHubCISettings,
  testGitHubCISettings,
  type ActionState,
} from "../actions";

export function GitHubCIForm({ settings }: { settings: AppSettings }) {
  const t = useTranslations("admin.services.githubCI");
  const [showToken, setShowToken] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const repoRef   = useRef<HTMLInputElement>(null);
  const patRef    = useRef<HTMLInputElement>(null);
  const branchRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, isSaving] = useActionState<ActionState, FormData>(
    saveGitHubCISettings,
    {},
  );
  const [testState, testAction, isTesting] = useActionState<ActionState, FormData>(
    testGitHubCISettings,
    {},
  );

  const lastSaveTs = useRef<number>(0);
  const lastTestTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState) setToast({ message: saveState.success, type: "success" });
    if ("error"   in saveState) setToast({ message: saveState.error,   type: "error" });
  }, [saveState]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState) setToast({ message: testState.success, type: "success" });
    if ("error"   in testState) setToast({ message: testState.error,   type: "error" });
  }, [testState]);

  const tokenMasked = settings.github_pat
    ? settings.github_pat.slice(0, 7) + "????????????????"
    : "";

  function handleTest() {
    const fd = new FormData();
    fd.append("github_repo",      repoRef.current?.value     ?? "");
    fd.append("github_pat",       patRef.current?.value      ?? "");
    fd.append("github_ci_branch", branchRef.current?.value   ?? "");
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

          {/* Repo */}
          <div className="space-y-1.5">
            <label
              htmlFor="github_repo"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("repoLabel")}
            </label>
            <input
              ref={repoRef}
              id="github_repo"
              name="github_repo"
              type="text"
              defaultValue={settings.github_repo ?? ""}
              placeholder={t("repoPlaceholder")}
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{
                background: "var(--admin-input-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("repoHintBefore")}{" "}
              <code className="px-1 rounded" style={{ background: "var(--admin-card-border)" }}>
                {t("repoHintCode")}
              </code>
            </p>
          </div>

          {/* PAT */}
          <div className="space-y-1.5">
            <label
              htmlFor="github_pat"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("patLabel")}
            </label>
            <div className="relative">
              <input
                ref={patRef}
                id="github_pat"
                name="github_pat"
                type={showToken ? "text" : "password"}
                defaultValue={settings.github_pat ?? ""}
                placeholder={tokenMasked || "github_pat_????????????????"}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono"
                style={{
                  background: "var(--admin-input-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                  outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
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
              {t("patHintBefore")}{" "}
              <strong style={{ color: "var(--admin-text)" }}>{t("patHintBold")}</strong>
              {" "}{t("patHintAfter")}{" "}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--admin-accent)" }}
                className="underline underline-offset-2">
                {t("patHintLink")}
              </a>
            </p>
          </div>

          {/* Branch */}
          <div className="space-y-1.5">
            <label
              htmlFor="github_ci_branch"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("branchLabel")}
            </label>
            <input
              ref={branchRef}
              id="github_ci_branch"
              name="github_ci_branch"
              type="text"
              defaultValue={settings.github_ci_branch ?? "ci-results"}
              placeholder={t("branchPlaceholder")}
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono"
              style={{
                background: "var(--admin-input-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--admin-accent)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--admin-input-border)")}
            />
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              {t("branchHintBefore")}{" "}
              <code className="px-1 rounded" style={{ background: "var(--admin-card-border)" }}>
                {t("branchHintFile")}
              </code>.
              {" "}{t("branchHintDefault")}{" "}
              <code className="px-1 rounded" style={{ background: "var(--admin-card-border)" }}>
                {t("branchHintDefaultValue")}
              </code>.
            </p>
          </div>

          {/* Info Box */}
          <div
            className="flex gap-3 px-4 py-3 rounded-lg text-xs"
            style={{
              background: "color-mix(in oklch, var(--admin-accent) 6%, var(--admin-card-bg))",
              border: "1px solid color-mix(in oklch, var(--admin-accent) 20%, transparent)",
            }}>
            <GitMerge
              size={14}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--admin-accent)" }}
            />
            <div className="space-y-1.5">
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine1Before")}{" "}
                <strong style={{ color: "var(--admin-text)" }}>{t("infoBoxLine1Branch")}</strong>{" "}
                {t("infoBoxLine1After")}
              </p>
              <p style={{ color: "var(--admin-text-muted)" }}>
                {t("infoBoxLine2Before")}{" "}
                <code className="px-1 rounded" style={{ background: "var(--admin-card-border)", color: "var(--admin-text)" }}>
                  {t("infoBoxLine2Path")}
                </code>{" "}
                {t("infoBoxLine2Middle")}{" "}
                <strong style={{ color: "var(--admin-text)" }}>{t("infoBoxLine2Bold")}</strong>{" "}
                {t("infoBoxLine2After")}
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
