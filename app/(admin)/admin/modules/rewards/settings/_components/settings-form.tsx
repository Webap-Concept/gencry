"use client";
import { useState, useTransition } from "react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { updateRewardRule, type UpdateRuleInput } from "../actions";
import type { RewardsRule } from "@/lib/db/schema";

const EVENT_LABEL: Record<string, string> = {
  daily_checkin:   "Daily check-in",
  post_created:    "Post published",
  like_received:   "Reactions received (post author)",
  comment_created: "Comment created",
  streak_7:        "7-day streak",
  streak_14:       "14-day streak",
  streak_30:       "30-day streak",
};

const EVENT_DESCRIPTION: Record<string, string> = {
  daily_checkin:   "Once per local day (idempotency on local date). No cap needed.",
  post_created:    "On post creation. Daily cap prevents spam.",
  like_received:   "Awarded to post author on reaction insert (DB trigger). Anti-self + daily cap.",
  comment_created: "On comment creation. Daily cap prevents spam.",
  streak_7:        "Bonus when user hits exactly 7 consecutive daily check-ins. Fires once per streak run.",
  streak_14:       "Bonus at 14 consecutive days. Fires once per streak run.",
  streak_30:       "Bonus at 30 consecutive days. Fires once per streak run.",
};

export function RewardsSettingsForm({
  rules,
  isStreakSection = false,
}: {
  rules: RewardsRule[];
  isStreakSection?: boolean;
}) {
  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <RuleCard key={rule.eventType} rule={rule} isStreak={isStreakSection} />
      ))}
    </div>
  );
}

function RuleCard({ rule, isStreak = false }: { rule: RewardsRule; isStreak?: boolean }) {
  const [amount, setAmount]   = useState(String(rule.amount));
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
            min={0.01}
            max={10000}
            step={0.01}
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
        {/* Streak milestone: no daily_cap (fires once per streak run by design) */}
        {!isStreak && rule.eventType !== "daily_checkin" && (
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
