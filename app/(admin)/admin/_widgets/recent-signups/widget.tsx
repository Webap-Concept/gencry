import { getLocale, getTranslations } from "next-intl/server";
import { desc, eq, isNull } from "drizzle-orm";
import { UserPlus, Mail, KeyRound } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { db } from "@/lib/db/drizzle";
import { users, userProfiles, oauthAccounts } from "@/lib/db/schema";

const RECENT_LIMIT = 5;

export default async function RecentSignupsWidget() {
  const [rows, t, locale] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        provider: oauthAccounts.provider,
        username: userProfiles.username,
      })
      .from(users)
      .leftJoin(oauthAccounts, eq(oauthAccounts.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.createdAt))
      .limit(RECENT_LIMIT),
    getTranslations("admin.dashboard.widgets.recentSignups"),
    getLocale(),
  ]);

  return (
    <WidgetCard title={t("title")} icon={UserPlus} scrollable={false}>
      {rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--admin-text-muted)",
          }}
        >
          {t("empty")}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {rows.map((row, i) => (
            <SignupRow
              key={row.id}
              email={row.email}
              username={row.username}
              anonymousLabel={t("anonymous")}
              createdAt={row.createdAt}
              provider={row.provider}
              locale={locale}
              providerLabel={
                row.provider
                  ? t("providerOAuth", { name: row.provider })
                  : t("providerEmail")
              }
              isLast={i === rows.length - 1}
            />
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function SignupRow({
  email,
  username,
  anonymousLabel,
  createdAt,
  provider,
  providerLabel,
  locale,
  isLast,
}: {
  email: string;
  username: string | null;
  anonymousLabel: string;
  createdAt: Date;
  provider: string | null;
  providerLabel: string;
  locale: string;
  isLast: boolean;
}) {
  const Icon = provider ? KeyRound : Mail;
  const displayName = username ? `@${username}` : anonymousLabel;

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: isLast ? "none" : "1px solid var(--admin-divider)",
      }}
      title={`${email}\n${providerLabel}`}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
          color: "var(--admin-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        aria-hidden
      >
        <Icon size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: username ? "var(--admin-text)" : "var(--admin-text-faint)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontStyle: username ? "normal" : "italic",
          }}
        >
          {displayName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--admin-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {maskEmail(email)}
          <span style={{ color: "var(--admin-text-faint)" }}>
            {" · "}
            {providerLabel}
          </span>
        </div>
      </div>
      <span
        style={{
          fontSize: 11,
          color: "var(--admin-text-muted)",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatRelative(createdAt, locale)}
      </span>
    </li>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Mask an email's local-part to avoid splattering PII into the widget. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 2) return `${local[0]}•••@${domain}`;
  const masked = `${local[0]}${"•".repeat(Math.min(local.length - 2, 4))}${local.slice(-1)}`;
  return `${masked}@${domain}`;
}

/**
 * Locale-aware "5m ago" / "2h ago" / "3d ago" formatter. We render this
 * on the server — the widget is non-interactive so the time-since-event
 * is essentially "as of last cache refresh" which is fine for a 5-row
 * recent list.
 */
function formatRelative(date: Date, locale: string): string {
  const diffMs = Date.now() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return rtf.format(0, "second");
  if (min < 60) return rtf.format(-min, "minute");
  const hours = Math.round(min / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  return rtf.format(-months, "month");
}
