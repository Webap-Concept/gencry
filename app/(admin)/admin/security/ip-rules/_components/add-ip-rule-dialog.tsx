"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { actionAddIpRule } from "../actions";

type Action = "allow" | "deny";
type Scope = "auth" | "admin" | "all";
type Duration = "never" | "1h" | "24h" | "7d" | "30d";

interface Props {
  currentIp: string | null;
  onClose: () => void;
  onDone: (ok: boolean, errorKey?: string) => void;
}

export function AddIpRuleDialog({ currentIp, onClose, onDone }: Props) {
  const t = useTranslations("admin.security.ipRules");
  const [ip, setIp] = useState("");
  const [action, setAction] = useState<Action>("deny");
  const [scope, setScope] = useState<Scope>("auth");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<Duration>("never");
  const [isPending, startTransition] = useTransition();

  function fillCurrentIp() {
    if (currentIp) setIp(currentIp);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("ip", ip.trim());
    fd.set("action", action);
    fd.set("scope", scope);
    fd.set("reason", reason);
    fd.set("duration", duration);
    startTransition(async () => {
      const res = await actionAddIpRule(fd);
      if (res.ok) onDone(true);
      else onDone(false, res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}>
      <div
        className="rounded-xl p-6 max-w-md w-full shadow-xl"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--admin-text)" }}>
          {t("dialogAddTitle")}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* IP / CIDR */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--admin-text)" }}>
              {t("fieldIpLabel")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder={t("fieldIpPlaceholder")}
                maxLength={50}
                className="flex-1 px-3 py-2 rounded-md text-sm font-mono"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
              {currentIp && (
                <button
                  type="button"
                  onClick={fillCurrentIp}
                  className="px-2.5 py-1 rounded-md text-xs font-medium border"
                  style={{
                    borderColor: "var(--admin-card-border)",
                    color: "var(--admin-text-muted)",
                  }}
                  title={t("useCurrentIpTitle")}>
                  {t("useCurrentIp")}
                </button>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
              {t("fieldIpHelp")}
            </p>
          </div>

          {/* Action */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--admin-text)" }}>
              {t("fieldActionLabel")}
            </label>
            <div className="flex gap-2">
              <RadioPill
                checked={action === "allow"}
                onChange={() => setAction("allow")}
                label={t("actionAllow")}
                description={t("actionAllowHint")}
                tone="green"
              />
              <RadioPill
                checked={action === "deny"}
                onChange={() => setAction("deny")}
                label={t("actionDeny")}
                description={t("actionDenyHint")}
                tone="red"
              />
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--admin-text)" }}>
              {t("fieldScopeLabel")}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}>
              <option value="auth">{t("scope_auth")}</option>
              <option value="admin">{t("scope_admin")}</option>
              <option value="all">{t("scope_all")}</option>
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--admin-text-faint)" }}>
              {t(`scopeHint_${scope}`)}
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--admin-text)" }}>
              {t("fieldDurationLabel")}
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value as Duration)}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}>
              <option value="never">{t("durationNever")}</option>
              <option value="1h">{t("duration1h")}</option>
              <option value="24h">{t("duration24h")}</option>
              <option value="7d">{t("duration7d")}</option>
              <option value="30d">{t("duration30d")}</option>
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--admin-text)" }}>
              {t("fieldReasonLabel")}{" "}
              <span style={{ color: "var(--admin-text-faint)" }}>
                ({t("optional")})
              </span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={255}
              placeholder={t("fieldReasonPlaceholder")}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{
                borderColor: "var(--admin-card-border)",
                color: "var(--admin-text)",
              }}>
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending || !ip.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}>
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("saveRule")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RadioPill({
  checked,
  onChange,
  label,
  description,
  tone,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
  tone: "green" | "red";
}) {
  const accent = tone === "green" ? "#10b981" : "#ef4444";
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="flex-1 text-left rounded-md px-3 py-2 text-xs transition-colors"
      style={{
        background: checked
          ? `color-mix(in srgb, ${accent} 12%, var(--admin-card-bg))`
          : "var(--admin-card-bg)",
        border: `1px solid ${checked ? accent : "var(--admin-card-border)"}`,
        color: checked ? accent : "var(--admin-text)",
      }}>
      <div className="font-semibold">{label}</div>
      <div
        className="text-xs mt-0.5"
        style={{ color: checked ? accent : "var(--admin-text-faint)" }}>
        {description}
      </div>
    </button>
  );
}
