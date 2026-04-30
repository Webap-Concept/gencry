"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import { roles, staffInvitations, userProfiles, users } from "@/lib/db/schema";
import { sendStaffInvitationEmail } from "@/lib/email/templates/staff-invitation";
import { requireAdmin } from "@/lib/rbac/guards";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function changeStaffRole(userId: string, roleName: string) {
  await requireAdmin();

  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) throw new Error("Role not found.");
  if (!role.isAdmin) {
    throw new Error("You can only assign roles with the Administrator flag.");
  }

  await db
    .update(users)
    .set({
      role: roleName,
      isAdmin: role.isAdmin ?? false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath(getAdminPath("users-staff"));
}

export type UserSearchResult = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
};

export async function searchNonAdminUsers(
  query: string,
): Promise<UserSearchResult[]> {
  await requireAdmin();

  const q = query.trim();
  if (q.length < 2) return [];

  return db
    .select({
      id: users.id,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      email: users.email,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        isNull(users.deletedAt),
        sql`${users.isAdmin} = false`,
        sql`(
          ${users.email} ILIKE ${"%" + q + "%"} OR
          ${userProfiles.firstName} ILIKE ${"%" + q + "%"} OR
          ${userProfiles.lastName} ILIKE ${"%" + q + "%"}
        )`,
      ),
    )
    .limit(8);
}

export async function addUserToStaff(userId: string, roleName: string) {
  await requireAdmin();

  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) throw new Error("Role not found.");
  if (!role.isAdmin) {
    throw new Error("You can only assign roles with the Administrator flag.");
  }

  await db
    .update(users)
    .set({ role: roleName, isAdmin: true, updatedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath(getAdminPath("users-staff"));
}

export async function inviteStaffMember(
  email: string,
  roleName: string,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  const emailParsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!emailParsed.success) return { error: "Email non valida." };
  const normalizedEmail = emailParsed.data;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    return {
      error:
        "Questa email appartiene già a un utente registrato. Usa 'Promuovi utente'.",
    };
  }

  const [role] = await db
    .select({ isAdmin: roles.isAdmin, label: roles.label })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) return { error: "Ruolo non trovato." };
  if (!role.isAdmin)
    return { error: "Puoi assegnare solo ruoli con il flag Amministratore." };

  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await db.insert(staffInvitations).values({
    email: normalizedEmail,
    role: roleName,
    token,
    invitedBy: admin.id,
    expiresAt,
  });

  const inviterName =
    [admin.firstName, admin.lastName].filter(Boolean).join(" ") ||
    "Un amministratore";

  try {
    await sendStaffInvitationEmail(
      normalizedEmail,
      token,
      role.label,
      inviterName,
    );
  } catch (err) {
    console.error("[inviteStaffMember] sendStaffInvitationEmail failed:", err);
  }

  revalidatePath(getAdminPath("users-staff"));
  return {};
}
