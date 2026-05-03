"use client";

import { Activity, Key, Monitor, ScrollText, User } from "lucide-react";
import { useState } from "react";

type Props = {
  infoContent: React.ReactNode;
  activityContent: React.ReactNode;
  accessContent: React.ReactNode;
  sessionsContent: React.ReactNode;
  consentsContent: React.ReactNode;
  overridesCount: number;
  activeSessionsCount: number;
  consentsCount: number;
};

export function UserDetailTabs({
  infoContent,
  activityContent,
  accessContent,
  sessionsContent,
  consentsContent,
  overridesCount,
  activeSessionsCount,
  consentsCount,
}: Props) {
  const [active, setActive] = useState<
    "info" | "access" | "sessions" | "activity" | "consents"
  >("info");

  const tabs = [
    { id: "info" as const, label: "Info", icon: User },
    {
      id: "access" as const,
      label: "Access",
      icon: Key,
      badge: overridesCount > 0 ? overridesCount : undefined,
    },
    {
      id: "sessions" as const,
      label: "Sessions",
      icon: Monitor,
      badge: activeSessionsCount > 0 ? activeSessionsCount : undefined,
    },
    { id: "activity" as const, label: "Activity", icon: Activity },
    {
      id: "consents" as const,
      label: "Consents",
      icon: ScrollText,
      badge: consentsCount > 0 ? consentsCount : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--admin-hover-bg)" }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
              style={{
                background: isActive ? "var(--admin-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--admin-text-muted)",
                boxShadow: isActive ? "0 1px 3px oklch(0 0 0 / 0.15)" : "none",
              }}>
              <Icon size={13} />
              {t.label}
              {t.badge !== undefined && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.25)" : "#dbeafe",
                    color: isActive ? "#fff" : "#2563eb",
                  }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {active === "info" && infoContent}
      {active === "access" && accessContent}
      {active === "sessions" && sessionsContent}
      {active === "activity" && activityContent}
      {active === "consents" && consentsContent}
    </div>
  );
}
