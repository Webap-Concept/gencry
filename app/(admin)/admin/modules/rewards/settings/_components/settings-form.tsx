"use client";
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { updateRewardRule, type UpdateRuleInput } from "../actions";
import type { RewardsRule } from "@/lib/db/schema";

const EVENT_LABEL: Record<string, string> = {
  daily_checkin: "Daily check-in",
  post_created:  "Post published",
  like_received: "Like received (post author)",
};

const EVENT_DESCRIPTION: Record<string, string> = {
  daily_checkin: "Accreditato una volta al giorno (idempotency sulla data UTC). Nessun cap necessario.",
  post_created:  "Accreditato alla creazione di un post. Daily cap anti-spam.",
  like_received: "Accreditato all'autore del post quando riceve un like (trigger DB). Anti-self-like + daily cap.",
};

export function RewardsSettingsForm({ rules }: { rules: RewardsRule[] }) {
  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <RuleCard key={rule.eventType} rule={rule} />
      ))}
    </div>
  );
}

function RuleCard({ rule }: { rule: RewardsRule }) {
  const [amount, setAmount]   = useState(rule.amount.toString());
  const [dailyCap, setDailyCap] = useState((rule.dailyCap ?? 0).toString());
  const [enabled, setEnabled] = useState(rule.enabled);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateRewardRule({
        eventType: rule.eventType as UpdateRuleInput["eventType"],
        amount:    parseInt(amount, 10),
        dailyCap:  parseInt(dailyCap, 10) || null,
        enabled,
      });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            {EVENT_LABEL[rule.eventType] ?? rule.eventType}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--admin-text-muted)" }}>
            {EVENT_DESCRIPTION[rule.eventType]}
          </div>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>Enabled</span>
        </label>
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>
            Amount (coins)
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 rounded-md border px-2 py-1 text-sm tabular-nums"
            style={{
              background: "var(--admin-input-bg)",
              borderColor: "var(--admin-card-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>
        {rule.eventType !== "daily_checkin" && (
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--admin-text-muted)" }}>
              Daily cap (0 = none)
            </label>
            <input
              type="number"
              min={0}
              max={10000}
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              className="w-24 rounded-md border px-2 py-1 text-sm tabular-nums"
              style={{
                background: "var(--admin-input-bg)",
                borderColor: "var(--admin-card-border)",
                color: "var(--admin-text)",
              }}
            />
          </div>
        )}
        <AdminButton
          variant="primary"
          size="sm"
          loading={pending}
          onClick={handleSave}
        >
          {saved ? "Saved" : "Save"}
        </AdminButton>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--admin-danger)" }}>{error}</p>
      )}
    </div>
  );
}
