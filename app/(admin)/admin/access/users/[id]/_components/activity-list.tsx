"use client";

import { ActivityLog, ActivityType } from "@/lib/db/schema";

const ACTION_ICONS: Record<string, string> = {
  // Auth
  [ActivityType.SIGN_IN]: "🔐",
  [ActivityType.SIGN_OUT]: "🚪",
  [ActivityType.SIGN_UP]: "✨",
  [ActivityType.UPDATE_PASSWORD]: "🔑",
  [ActivityType.UPDATE_ACCOUNT]: "✏️",
  [ActivityType.DELETE_ACCOUNT]: "🗑️",
  // Email
  [ActivityType.EMAIL_VERIFIED]: "✅",
  [ActivityType.EMAIL_CHANGED]: "📧",
  [ActivityType.PASSWORD_RESET_REQUESTED]: "🔒",
  [ActivityType.PASSWORD_RESET_COMPLETED]: "🔓",
  // Subscription
  [ActivityType.SUBSCRIPTION_STARTED]: "🚀",
  [ActivityType.SUBSCRIPTION_CANCELLED]: "❌",
  [ActivityType.SUBSCRIPTION_RENEWED]: "🔄",
  [ActivityType.SUBSCRIPTION_UPGRADED]: "⬆️",
  [ActivityType.SUBSCRIPTION_DOWNGRADED]: "⬇️",
  [ActivityType.PAYMENT_FAILED]: "💳",
  // Admin
  [ActivityType.ADMIN_BAN_USER]: "🚫",
  [ActivityType.ADMIN_UNBAN_USER]: "✔️",
  [ActivityType.ADMIN_CHANGE_ROLE]: "🛡️",
  [ActivityType.ADMIN_DELETE_USER]: "💀",
  // Profilo
  [ActivityType.AVATAR_UPDATED]: "🖼️",
  [ActivityType.BIO_UPDATED]: "📝",
  [ActivityType.PROFILE_VIEWED]: "👁️",
  // Contenuti
  [ActivityType.POST_CREATED]: "📄",
  [ActivityType.POST_EDITED]: "✏️",
  [ActivityType.POST_DELETED]: "🗑️",
  [ActivityType.COMMENT_CREATED]: "💬",
  [ActivityType.COMMENT_DELETED]: "🗑️",
  // Interazioni
  [ActivityType.LIKE_ADDED]: "❤️",
  [ActivityType.LIKE_REMOVED]: "🤍",
  [ActivityType.FOLLOW_USER]: "➕",
  [ActivityType.UNFOLLOW_USER]: "➖",
  [ActivityType.BLOCK_USER]: "🚷",
  [ActivityType.UNBLOCK_USER]: "✅",
  // Notifiche & messaggi
  [ActivityType.NOTIFICATION_READ]: "🔔",
  [ActivityType.MESSAGE_SENT]: "✉️",
  // Moderazione
  [ActivityType.CONTENT_REPORTED]: "⚠️",
  [ActivityType.CONTENT_REMOVED]: "🛑",
};

type ActivityItem = {
  id: number;
  action: string;
  timestamp: Date;
  ipAddress?: string | null;
};

export function ActivityList({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <p
        className="text-sm text-center py-8"
        style={{ color: "var(--admin-text-faint)" }}>
        No activity logged.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {activity.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--admin-hover-bg)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }>
          <span>{ACTION_ICONS[log.action as ActivityType] ?? "📋"}</span>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              {log.action
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/^\w/, (c) => c.toUpperCase())}
            </p>
            {log.ipAddress && (
              <p
                className="text-xs"
                style={{ color: "var(--admin-text-faint)" }}>
                IP: {log.ipAddress}
              </p>
            )}
          </div>
          <span
            className="text-xs shrink-0"
            style={{ color: "var(--admin-text-faint)" }}>
            {new Date(log.timestamp).toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
