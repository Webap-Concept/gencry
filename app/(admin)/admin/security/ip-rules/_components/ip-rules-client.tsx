"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { IpRule } from "@/lib/db/schema";
import {
  CheckCircle2,
  Lock,
  LockOpen,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  actionRemoveIpRule,
  actionToggleAdminLockdown,
} from "../actions";
import { AddIpRuleDialog } from "./add-ip-rule-dialog";

type Decision = "allow" | "deny" | "no-rule";

interface Props {
  initialRules: IpRule[];
  lockdownEnabled: boolean;
  currentIp: string | null;
  currentIpAdminDecision: Decision;
}

export function IpRulesClient({
  initialRules,
  lockdownEnabled,
  currentIp,
  currentIpAdminDecision,
}: Props) {
  const t = useTranslations("admin.security.ipRules");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IpRule | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAddDone(ok: boolean, errorKey?: string) {
    setAddOpen(false);
    if (ok) setToast({ message: t("toastAdded"), type: "success" });
    else setToast({ message: t(errorKey ?? "errorGeneric"), type: "error" });
  }

  function handleRemove(rule: IpRule) {
    setPendingDelete(rule);
  }

  function confirmRemove() {
    if (!pendingDelete) return;
    const rule = pendingDelete;
    setPendingId(rule.id);
    const fd = new FormData();
    fd.set("id", String(rule.id));
    startTransition(async () => {
      const res = await actionRemoveIpRule(fd);
      setPendingId(null);
      setPendingDelete(null);
      if (res.ok) setToast({ message: t("toastRemoved"), type: "success" });
      else setToast({ message: t(res.error), type: "error" });
    });
  }

  function handleLockdownToggle(next: boolean) {
    const fd = new FormData();
    fd.set("enabled", next ? "true" : "false");
    startTransition(async () => {
      const res = await actionToggleAdminLockdown(fd);
      if (res.ok) {
        setToast({
          message: next ? t("toastLockdownOn") : t("toastLockdownOff"),
          type: "success",
        });
      } else {
        setToast({ message: t(res.error), type: "error" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Banner IP corrente + lockdown toggle */}
      <CurrentIpBanner
        currentIp={currentIp}
        decision={currentIpAdminDecision}
        lockdownEnabled={lockdownEnabled}
        onToggle={handleLockdownToggle}
      />

      {/* Toolbar: add */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          {t("rulesTitle")}{" "}
          <span style={{ color: "var(--admin-text-faint)", fontWeight: 400 }}>
            ({initialRules.length})
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: "var(--admin-accent)" }}>
          <Plus size={14} />
          {t("addRule")}
        </button>
      </div>

      {/* Tabella */}
      {initialRules.length === 0 ? (
        <EmptyState />
      ) : (
        <RulesTable
          rules={initialRules}
          pendingId={pendingId}
          onRemove={handleRemove}
        />
      )}

      {addOpen && (
        <AddIpRuleDialog
          currentIp={currentIp}
          onClose={() => setAddOpen(false)}
          onDone={handleAddDone}
        />
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={t("confirmRemoveTitle")}
        message={t.rich("confirmRemoveBody", {
          ip: pendingDelete?.ip ?? "",
          code: (chunks) => (
            <code
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: "var(--admin-hover-bg)",
                padding: "1px 5px",
                borderRadius: 4,
                color: "var(--admin-text)",
              }}>
              {chunks}
            </code>
          ),
        })}
        variant="danger"
        confirmLabel={t("confirmRemoveConfirm")}
        loading={isPending && pendingId === pendingDelete?.id}
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ─── Banner IP corrente + lockdown toggle ──────────────────────────────────

function CurrentIpBanner({
  currentIp,
  decision,
  lockdownEnabled,
  onToggle,
}: {
  currentIp: string | null;
  decision: Decision;
  lockdownEnabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("admin.security.ipRules");
  const [, startTransition] = useTransition();

  // Colore + icona dello stato IP
  const statusColor =
    decision === "allow" ? "#10b981" : decision === "deny" ? "#ef4444" : "#94a3b8";
  const StatusIcon =
    decision === "allow" ? CheckCircle2 : decision === "deny" ? XCircle : ShieldAlert;
  const statusLabel = t(
    decision === "allow"
      ? "statusAllow"
      : decision === "deny"
        ? "statusDeny"
        : "statusNoRule",
  );

  // Quando lockdown è ON e l'IP corrente NON è allow, lo banner urla.
  const dangerActive = lockdownEnabled && decision !== "allow";

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: dangerActive
          ? "color-mix(in srgb, #ef4444 8%, var(--admin-card-bg))"
          : "var(--admin-card-bg)",
        border: `1px solid ${
          dangerActive
            ? "color-mix(in srgb, #ef4444 30%, transparent)"
            : "var(--admin-card-border)"
        }`,
      }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon size={16} style={{ color: statusColor }} />
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--admin-text)" }}>
            {t("currentIpLabel")}:{" "}
            <code
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: "var(--admin-page-bg, rgba(0,0,0,0.04))",
                color: "var(--admin-text)",
                fontFamily: "monospace",
              }}>
              {currentIp ?? t("currentIpUnknown")}
            </code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {lockdownEnabled ? (
              <Lock size={14} style={{ color: "var(--admin-accent)" }} />
            ) : (
              <LockOpen size={14} style={{ color: "var(--admin-text-faint)" }} />
            )}
            <span className="text-xs font-medium" style={{ color: "var(--admin-text)" }}>
              {t("lockdownLabel")}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={lockdownEnabled}
            onClick={() => startTransition(() => onToggle(!lockdownEnabled))}
            className="relative inline-flex items-center rounded-full transition-colors"
            style={{
              width: 36,
              height: 20,
              background: lockdownEnabled
                ? "var(--admin-accent)"
                : "var(--admin-text-faint)",
            }}>
            <span
              className="inline-block bg-white rounded-full shadow transition-transform"
              style={{
                width: 14,
                height: 14,
                transform: `translateX(${lockdownEnabled ? 19 : 3}px)`,
              }}
            />
          </button>
        </div>
      </div>

      {dangerActive && (
        <p
          className="text-xs mt-3"
          style={{ color: "#ef4444", fontWeight: 500 }}>
          {t("warnLockdownNoSelfAllow")}
        </p>
      )}
      {!lockdownEnabled && (
        <p className="text-xs mt-2" style={{ color: "var(--admin-text-faint)" }}>
          {t("lockdownDisabledHint")}
        </p>
      )}
    </div>
  );
}

// ─── Tabella regole ────────────────────────────────────────────────────────

function RulesTable({
  rules,
  pendingId,
  onRemove,
}: {
  rules: IpRule[];
  pendingId: number | null;
  onRemove: (rule: IpRule) => void;
}) {
  const t = useTranslations("admin.security.ipRules");
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <table className="w-full text-sm">
        <thead>
          <tr
            style={{
              background: "var(--admin-page-bg, rgba(0,0,0,0.02))",
              borderBottom: "1px solid var(--admin-card-border)",
            }}>
            <Th>{t("colIp")}</Th>
            <Th>{t("colAction")}</Th>
            <Th>{t("colScope")}</Th>
            <Th>{t("colReason")}</Th>
            <Th>{t("colExpires")}</Th>
            <Th align="right">{t("colHits")}</Th>
            <Th align="right">{t("colActions")}</Th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            const expiry = r.expiresAt ? new Date(r.expiresAt) : null;
            const expired = expiry !== null && expiry.getTime() <= Date.now();
            return (
              <tr
                key={r.id}
                style={{
                  borderTop: "1px solid var(--admin-card-border)",
                  opacity: expired ? 0.55 : 1,
                }}>
                <Td>
                  <code style={{ fontFamily: "monospace" }}>{r.ip}</code>
                </Td>
                <Td>
                  <ActionBadge action={r.action as "allow" | "deny"} />
                </Td>
                <Td>
                  <ScopeBadge scope={r.scope as "auth" | "admin" | "all"} />
                </Td>
                <Td>
                  <span style={{ color: "var(--admin-text-muted)" }}>
                    {r.reason ?? "—"}
                  </span>
                </Td>
                <Td>
                  {expiry === null ? (
                    <span style={{ color: "var(--admin-text-faint)" }}>
                      {t("expiresNever")}
                    </span>
                  ) : (
                    <span style={{ color: expired ? "#ef4444" : "var(--admin-text-muted)" }}>
                      {expiry.toLocaleString()}
                    </span>
                  )}
                </Td>
                <Td align="right">
                  <span style={{ color: "var(--admin-text-muted)" }}>
                    {r.hitCount}
                  </span>
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => onRemove(r)}
                    disabled={pendingId === r.id}
                    aria-label={t("removeAriaLabel", { ip: r.ip })}
                    className="inline-flex items-center justify-center rounded p-1.5 disabled:opacity-50"
                    style={{ color: "#ef4444" }}>
                    <Trash2 size={14} />
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionBadge({ action }: { action: "allow" | "deny" }) {
  const t = useTranslations("admin.security.ipRules");
  const allow = action === "allow";
  const Icon = allow ? ShieldCheck : ShieldAlert;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: allow
          ? "color-mix(in srgb, #10b981 15%, var(--admin-card-bg))"
          : "color-mix(in srgb, #ef4444 15%, var(--admin-card-bg))",
        color: allow ? "#10b981" : "#ef4444",
        border: `1px solid ${allow ? "#6ee7b7" : "#fca5a5"}`,
      }}>
      <Icon size={11} />
      {t(allow ? "actionAllow" : "actionDeny")}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: "auth" | "admin" | "all" }) {
  const t = useTranslations("admin.security.ipRules");
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
      style={{
        background: "var(--admin-page-bg, rgba(0,0,0,0.04))",
        color: "var(--admin-text-muted)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {t(`scope_${scope}`)}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className="px-3 py-2 text-xs font-semibold"
      style={{
        textAlign: align === "right" ? "right" : "left",
        color: "var(--admin-text-muted)",
      }}>
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <td
      className="px-3 py-2"
      style={{
        textAlign: align === "right" ? "right" : "left",
        color: "var(--admin-text)",
      }}>
      {children}
    </td>
  );
}

function EmptyState() {
  const t = useTranslations("admin.security.ipRules");
  return (
    <div
      className="rounded-xl p-8 text-center"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px dashed var(--admin-card-border)",
      }}>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--admin-text)" }}>
        {t("emptyTitle")}
      </p>
      <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
        {t("emptyBody")}
      </p>
    </div>
  );
}
