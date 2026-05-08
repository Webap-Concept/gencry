import { getAdminUrlSlug } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { roles, staffInvitations, userProfiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CheckCircle2, Mail, ShieldCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { declineInvitation } from "./actions";

export const metadata: Metadata = { title: "Invito Staff" };

async function getInviteData(token: string) {
  const rows = await db
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      role: staffInvitations.role,
      roleLabel: roles.label,
      roleColor: roles.color,
      expiresAt: staffInvitations.expiresAt,
      acceptedAt: staffInvitations.acceptedAt,
      declinedAt: staffInvitations.declinedAt,
      inviterFirstName: userProfiles.firstName,
      inviterLastName: userProfiles.lastName,
      inviterEmail: users.email,
    })
    .from(staffInvitations)
    .leftJoin(roles, eq(roles.name, staffInvitations.role))
    .leftJoin(users, eq(users.id, staffInvitations.invitedBy))
    .leftJoin(userProfiles, eq(userProfiles.userId, staffInvitations.invitedBy))
    .where(eq(staffInvitations.token, token))
    .limit(1);

  return rows[0] ?? null;
}

export default async function StaffInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ declined?: string }>;
}) {
  const { token } = await params;
  const { declined } = await searchParams;
  const t = await getTranslations("auth");
  const locale = await getLocale();
  const invite = await getInviteData(token);
  const adminSlug = await getAdminUrlSlug();
  const adminSignInHref = `/${adminSlug}/sign-in`;

  // ── Invalid token ────────────────────────────────────────────────────────
  if (!invite) {
    return (
      <StatusPage
        icon={<XCircle className="h-8 w-8 text-red-400" />}
        title={t("staffInvite.invalidLinkTitle")}
        message={t("staffInvite.invalidLinkMessage")}
        linkHref="/"
        linkLabel={t("staffInvite.backToHome")}
      />
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (new Date() > invite.expiresAt && !invite.acceptedAt && !invite.declinedAt) {
    return (
      <StatusPage
        icon={<XCircle className="h-8 w-8 text-amber-400" />}
        title={t("staffInvite.expiredTitle")}
        message={t("staffInvite.expiredMessage")}
        linkHref="/"
        linkLabel={t("staffInvite.backToHome")}
      />
    );
  }

  // ── Already accepted ─────────────────────────────────────────────────────
  if (invite.acceptedAt) {
    return (
      <StatusPage
        icon={<CheckCircle2 className="h-8 w-8 text-emerald-400" />}
        title={t("staffInvite.acceptedTitle")}
        message={t("staffInvite.acceptedMessage")}
        linkHref={adminSignInHref}
        linkLabel={t("staffInvite.acceptedAction")}
      />
    );
  }

  // ── Declined (either just now or previously) ─────────────────────────────
  if (invite.declinedAt || declined === "1") {
    return (
      <StatusPage
        icon={<XCircle className="h-8 w-8 text-brand-text-muted" />}
        title={t("staffInvite.declinedTitle")}
        message={t("staffInvite.declinedMessage")}
        linkHref="/"
        linkLabel={t("staffInvite.backToHome")}
      />
    );
  }

  // ── Active invite ─────────────────────────────────────────────────────────
  const inviterName =
    [invite.inviterFirstName, invite.inviterLastName].filter(Boolean).join(" ") ||
    invite.inviterEmail ||
    t("staffInvite.fallbackInviter");

  const roleColor = invite.roleColor ?? "#6b7280";
  const roleLabel = invite.roleLabel ?? invite.role;

  const declineAction = declineInvitation.bind(null, token);

  // Locale per la formattazione data: "it" → "it-IT", "en" → "en-US"
  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  const formattedDate = invite.expiresAt.toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
      <div className="w-full max-w-md">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-brand-bg">
            <ShieldCheck className="h-6 w-6 text-brand-primary" />
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-semibold mb-1 text-brand-text">
            {t("staffInvite.title")}
          </h1>
          <p className="text-sm text-brand-text-muted mb-6">
            <strong className="text-brand-text">{inviterName}</strong>{" "}
            {t("staffInvite.invitedByPrefix")}{" "}
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{
                background: roleColor + "18",
                color: roleColor,
                border: `1px solid ${roleColor}40`,
              }}
            >
              {roleLabel}
            </span>
            .
          </p>

          {/* Email badge */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-6 bg-brand-bg border border-brand-border">
            <Mail className="h-4 w-4 text-brand-text-muted shrink-0" />
            <span className="text-sm text-brand-text">{invite.email}</span>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Link
              href={`/staff-invite/${token}/register`}
              className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-brand-primary hover:brightness-90 transition-all"
            >
              {t("staffInvite.accept")}
            </Link>

            <form action={declineAction}>
              <button
                type="submit"
                className="w-full px-4 py-2.5 text-sm font-medium text-brand-text-muted rounded-xl bg-brand-bg border border-brand-border hover:border-brand-primary hover:text-brand-text transition-colors"
              >
                {t("staffInvite.decline")}
              </button>
            </form>
          </div>

          <p className="text-xs text-brand-text-light text-center mt-5">
            {t("staffInvite.validUntil", { date: formattedDate })}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusPage({
  icon,
  title,
  message,
  linkHref,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
      <div className="w-full max-w-md">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface text-center">
          <div className="flex justify-center mb-4">{icon}</div>
          <h1 className="text-xl font-semibold text-brand-text mb-2">{title}</h1>
          <p className="text-sm text-brand-text-muted mb-6">{message}</p>
          <Link
            href={linkHref}
            className="text-sm font-semibold text-brand-primary hover:underline"
          >
            {linkLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
