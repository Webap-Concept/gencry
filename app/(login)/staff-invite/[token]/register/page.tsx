import { db } from "@/lib/db/drizzle";
import { roles, staffInvitations } from "@/lib/db/schema";
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import StaffRegisterForm from "./register-form";

export const metadata: Metadata = { title: "Registrazione Staff" };

export default async function StaffRegisterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [rows, slugs] = await Promise.all([
    db
      .select({
        email: staffInvitations.email,
        role: staffInvitations.role,
        roleLabel: roles.label,
        roleColor: roles.color,
        expiresAt: staffInvitations.expiresAt,
        acceptedAt: staffInvitations.acceptedAt,
        declinedAt: staffInvitations.declinedAt,
      })
      .from(staffInvitations)
      .leftJoin(roles, eq(roles.name, staffInvitations.role))
      .where(eq(staffInvitations.token, token))
      .limit(1),
    getSystemPageSlugs(),
  ]);

  const invite = rows[0];

  if (
    !invite ||
    invite.acceptedAt ||
    invite.declinedAt ||
    new Date() > invite.expiresAt
  ) {
    redirect(`/staff-invite/${token}`);
  }

  return (
    <StaffRegisterForm
      token={token}
      email={invite.email}
      roleLabel={invite.roleLabel ?? invite.role}
      roleColor={invite.roleColor ?? "#6b7280"}
      termsSlug={slugs.terms ?? "terms"}
      privacySlug={slugs.privacy ?? "privacy"}
    />
  );
}
