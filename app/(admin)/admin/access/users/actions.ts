"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  notifications,
  roles,
  sessions as sessionsTable,
  userProfiles,
  users,
} from "@/lib/db/schema";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendUserDeletedEmail } from "@/lib/email/templates/user-deleted";
import { sendModerationStrikeRevokedEmail } from "@/lib/email/templates/moderation-strike-revoked";
import { can } from "@/lib/rbac/can";
import { requireAdmin, requireAdminSectionPage } from "@/lib/rbac/guards";
import { revokeStrike } from "@/lib/auth/strikes";
import { getUser } from "@/lib/db/queries";
import { getSession, signToken } from "@/lib/auth/session";
import {
  createSession as createSessionRow,
  revokeSession,
} from "@/lib/auth/sessions";
import {
  deleteAvatarFromR2,
  uploadAvatarToR2,
} from "@/lib/storage/r2-avatars";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const MAX_ADMIN_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB — stessa soglia user

// Durata massima di una sessione impersonata. Volutamente corta per
// ridurre la finestra di abuso se l'admin lascia il laptop incustodito.
// Decisione 2026-05-27.
const IMPERSONATION_DURATION_MS = 30 * 60 * 1000; // 30 min

/**
 * Sync l'indice mention Upstash dopo un cambio di stato users
 * (bannedAt/deletedAt). syncMentionMember verifica internamente lo stato
 * corrente: utente valido → re-add, deletato/bannato → remove. Best-effort:
 * errore loggato ma non blocca l'action (un Upstash down non deve impedire
 * a un admin di bannare un utente). Import dinamico per non accoppiare il
 * core admin al modulo posts.
 */
async function syncMentionIndexFor(userId: string): Promise<void> {
  try {
    const { syncMentionMember } = await import(
      "@/lib/modules/posts/services/mention-index"
    );
    await syncMentionMember(userId);
  } catch (err) {
    console.error("[admin/users] mention-index sync failed:", err);
  }
}

/** Invalida la post-cache dell'utente (avatar denormalizzato nel feed). */
async function invalidatePostsCacheFor(userId: string): Promise<void> {
  try {
    const { invalidateAuthorPostsCache } = await import(
      "@/lib/modules/posts/queries"
    );
    await invalidateAuthorPostsCache(userId);
  } catch (err) {
    console.warn("[admin/users] invalidateAuthorPostsCache failed:", err);
  }
}

export async function banUser(userId: string, reason?: string) {
  await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const [target] = await db
    .select({ isAdmin: users.isAdmin, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.isAdmin) {
    throw new Error(t("cannotBanAdmin"));
  }

  if (target?.deletedAt) {
    throw new Error(t("alreadyDeleted"));
  }

  await db
    .update(users)
    .set({
      bannedAt: new Date(),
      bannedReason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await syncMentionIndexFor(userId);
  revalidatePath(await getAdminPath("users-list"));
}

export async function unbanUser(userId: string) {
  await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const [target] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (target?.deletedAt) {
    throw new Error(t("alreadyDeleted"));
  }

  await db
    .update(users)
    .set({ bannedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await syncMentionIndexFor(userId);
  revalidatePath(await getAdminPath("users-list"));
}

export async function deleteUser(userId: string) {
  const adminUser = await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const allowed = await can(adminUser, "users:delete");
  if (!allowed) throw new Error(t("missingDeletePermission"));

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: userProfiles.firstName,
      isAdmin: users.isAdmin,
      deletedAt: users.deletedAt,
      locale: users.locale,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const target = rows[0];
  if (!target) throw new Error(t("userNotFound"));
  if (target.isAdmin) throw new Error(t("cannotDeleteAdmin"));
  if (target.deletedAt) throw new Error(t("userAlreadyDeleted"));

  const deletedAt = new Date();

  await db
    .update(users)
    .set({ deletedAt, updatedAt: deletedAt })
    .where(eq(users.id, userId));

  await syncMentionIndexFor(userId);

  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_DELETE_USER,
    timestamp: deletedAt,
  });

  try {
    const locale = await resolveRecipientLocale(target.locale);
    await sendUserDeletedEmail(
      target.email,
      target.firstName ?? null,
      deletedAt,
      locale,
    );
  } catch (emailError) {
    console.error("[deleteUser] Error sending email:", emailError);
  }

  revalidatePath(await getAdminPath("users-list"));
}

/**
 * Cancel a pending soft-delete (admin-side restore). Mirror operation of
 * `deleteUser`: clears `users.deleted_at` so the user can sign in again
 * and the `soft-deleted-purge` cron stops targeting the row.
 *
 * Gated by `users:delete` (same permission as the destructive direction):
 * whoever can delete an account is the same actor who should be allowed
 * to roll back the request before the 30-day grace expires.
 */
export async function cancelUserDeletion(userId: string) {
  const adminUser = await requireAdmin();
  const t = await getTranslations("admin.access.users.actionErrors");

  const allowed = await can(adminUser, "users:delete");
  if (!allowed) throw new Error(t("missingDeletePermission"));

  const [target] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) throw new Error(t("userNotFound"));
  if (!target.deletedAt) throw new Error(t("userNotPendingDeletion"));

  const now = new Date();

  await db
    .update(users)
    .set({ deletedAt: null, updatedAt: now })
    .where(eq(users.id, userId));

  await syncMentionIndexFor(userId);

  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_CANCEL_USER_DELETION,
    timestamp: now,
  });

  revalidatePath(await getAdminPath("users-list"));
}

/** @deprecated Use setUserRole in /admin/roles/actions.ts */
export async function changeUserRole(userId: string, roleName: string) {
  await requireAdmin();

  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  await db
    .update(users)
    .set({
      role: roleName,
      isAdmin: role?.isAdmin ?? false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath(await getAdminPath("users-list"));
}

// ─────────────────────────────────────────────────────────────────────────
// Strike revoke: usato dal blocco "Strike history" nel user detail page.
// Gated `modules:posts.moderate` (decisione utente — chi può emettere
// strike può anche revocarli, no super-admin separato in V1).
// ─────────────────────────────────────────────────────────────────────────

export type RevokeUserStrikeResult =
  | { ok: true; activeCount: number; unbannedNow: boolean }
  | { ok: false; error: string };

export async function revokeUserStrikeAction(
  strikeId: string,
  note?: string,
): Promise<RevokeUserStrikeResult> {
  await requireAdminSectionPage("modules:posts.moderate");
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { usersStrikes } = await import("@/lib/db/schema");

  // Risolvi userId target PRIMA del revoke (mi serve per la notifica
  // anche se idempotent skippa l'update).
  const [target] = await db
    .select({ userId: usersStrikes.userId })
    .from(usersStrikes)
    .where(eq(usersStrikes.id, strikeId))
    .limit(1);
  if (!target) return { ok: false, error: "strike_not_found" };

  const result = await revokeStrike({
    strikeId,
    revokedBy: user.id,
    note: note?.trim() || null,
  });
  if ("error" in result) {
    return { ok: false, error: result.error };
  }

  // Notifica utente solo se la revoca era davvero "nuova".
  if (!result.alreadyRevoked) {
    try {
      await db.insert(notifications).values({
        userId: target.userId,
        type: "moderation.strike_revoked",
        actorId: user.id,
        payload: {
          active_count_after: result.activeStrikesCount,
          unbanned: result.unbannedNow,
        },
      });
    } catch (err) {
      console.warn("[revokeUserStrikeAction] notification failed:", err);
    }

    // Email transazionale best-effort (fail non rolla la revoke).
    try {
      const [recipient] = await db
        .select({
          email: users.email,
          userLocale: users.locale,
          firstName: userProfiles.firstName,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, target.userId))
        .limit(1);
      if (recipient?.email) {
        const locale = await resolveRecipientLocale(recipient.userLocale);
        await sendModerationStrikeRevokedEmail({
          to: recipient.email,
          userName: recipient.firstName ?? undefined,
          activeCountAfter: result.activeStrikesCount,
          unbanned: result.unbannedNow,
          locale,
        });
      }
    } catch (err) {
      console.warn("[revokeUserStrikeAction] email failed:", err);
    }
  }

  revalidatePath(await getAdminPath("users-list"));
  return {
    ok: true,
    activeCount: result.activeStrikesCount,
    unbannedNow: result.unbannedNow,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Admin avatar management — modifica avatar di un utente qualsiasi
// ─────────────────────────────────────────────────────────────────────────
//
// Pattern: stesso `uploadAvatarToR2` usato dal flow user-self, ma con
// target_user_id = utente nella detail page (non chi e' loggato).
// Decisione product 2026-05-27: niente notifica in-app, solo activity
// log interno tag `AVATAR_UPDATED_BY_ADMIN` — l'utente non vede log di
// activity in UI quindi audit resta admin-only.

export type AdminUpdateAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function adminUpdateUserAvatar(
  targetUserId: string,
  formData: FormData,
): Promise<AdminUpdateAvatarResult> {
  const adminUser = await requireAdminSectionPage("admin:users");
  const allowed =
    adminUser.isAdmin || (await can(adminUser, "users:edit"));
  if (!allowed) {
    return { ok: false, error: "Permesso `users:edit` mancante." };
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Seleziona un'immagine valida." };
  }
  if (file.size > MAX_ADMIN_AVATAR_BYTES) {
    return { ok: false, error: "Immagine troppo grande (max 2 MB)." };
  }

  // Verifica esistenza target (no admin-on-deleted user, evita orphan R2).
  const [target] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) return { ok: false, error: "Utente non trovato." };
  if (target.deletedAt) {
    return { ok: false, error: "Impossibile modificare avatar di un utente cancellato." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadAvatarToR2(targetUserId, buffer, file.type);
  if ("error" in result) return { ok: false, error: result.error };

  await db
    .update(userProfiles)
    .set({ avatarUrl: result.url, updatedAt: new Date() })
    .where(eq(userProfiles.userId, targetUserId));

  await invalidatePostsCacheFor(targetUserId);

  // Audit log sull'utente target — admin che visita la detail page lo vede
  // nella tab Activity. L'utente NON ha UI di propri activity log lato
  // frontend (decisione product 2026-05-27).
  await db.insert(activityLogs).values({
    userId: targetUserId,
    action: ActivityType.AVATAR_UPDATED_BY_ADMIN,
    ipAddress: "",
  });

  revalidatePath(await getAdminPath("users-list"));
  return { ok: true, url: result.url };
}

export async function adminRemoveUserAvatar(
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdminSectionPage("admin:users");
  const allowed =
    adminUser.isAdmin || (await can(adminUser, "users:edit"));
  if (!allowed) {
    return { ok: false, error: "Permesso `users:edit` mancante." };
  }

  const [target] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) return { ok: false, error: "Utente non trovato." };
  if (target.deletedAt) {
    return { ok: false, error: "Impossibile modificare avatar di un utente cancellato." };
  }

  await db
    .update(userProfiles)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(userProfiles.userId, targetUserId));

  await invalidatePostsCacheFor(targetUserId);

  // Best-effort R2 delete: errore loggato ma non blocca la action
  // (orphan e' recuperabile manualmente o via cleanup futuro).
  await deleteAvatarFromR2(targetUserId);

  await db.insert(activityLogs).values({
    userId: targetUserId,
    action: ActivityType.AVATAR_UPDATED_BY_ADMIN,
    ipAddress: "",
  });

  revalidatePath(await getAdminPath("users-list"));
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Impersonation — admin "diventa" un altro utente per debug/support
// ─────────────────────────────────────────────────────────────────────────
//
// Pattern (cookie singolo, swap atomico):
//   - start:
//       1. permission `users:impersonate` (o isAdmin)
//       2. target esistente, non-deletato, non-admin (anti-escalation)
//       3. crea NEW session per target con impersonator_session_id =
//          currentAdmin.sessionId, durationMs = 30min
//       4. ri-firma JWT con il nuovo sid + set cookie (sostituisce admin)
//       5. audit log su admin user (ADMIN_IMPERSONATE_START)
//       6. redirect a /  (front utente — l'admin "entra" come quell'utente)
//
//   - stop:
//       1. session corrente DEVE avere impersonatorSessionId != null
//       2. revoca current
//       3. ri-firma JWT col sid admin originale + set cookie
//       4. audit log (ADMIN_IMPERSONATE_STOP) sull'admin user
//       5. redirect a /admin/access/users (l'admin torna nel pannello)
//
// La admin session originale resta nel DB con revokedAt=NULL (sospesa
// logicamente, viva). Se l'admin perde il cookie durante l'impersonation
// → diventa logged-out al stop, deve ri-loggarsi: caveat accettato.

export type ImpersonateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function adminStartImpersonation(
  targetUserId: string,
): Promise<ImpersonateResult> {
  const adminUser = await requireAdminSectionPage("admin:users");
  const allowed =
    adminUser.isAdmin || (await can(adminUser, "users:impersonate"));
  if (!allowed) {
    return {
      ok: false,
      error: "Permesso `users:impersonate` mancante.",
    };
  }

  // Carico la session corrente DAL COOKIE — mi serve l'id per il
  // back-pointer della session impersonation.
  const current = await getSession();
  if (!current) {
    return { ok: false, error: "Sessione admin non valida." };
  }

  // Anti-escalation: target non puo' essere un admin globale, ne'
  // soft-deleted. Bannato e' OK (caso d'uso debug).
  const [target] = await db
    .select({
      id: users.id,
      isAdmin: users.isAdmin,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) return { ok: false, error: "Utente target non trovato." };
  if (target.deletedAt) {
    return { ok: false, error: "Impossibile impersonare un utente cancellato." };
  }
  if (target.isAdmin) {
    return {
      ok: false,
      error: "Impossibile impersonare un altro amministratore.",
    };
  }

  // Crea la session impersonata con back-pointer + expiry 30min.
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;

  const newSession = await createSessionRow({
    userId: targetUserId,
    role: "member", // role base; la cache miss leggera' il vero da users
    deviceToken: null,
    userAgent,
    ip,
    impersonatorSessionId: current.sessionId,
    durationMs: IMPERSONATION_DURATION_MS,
  });

  // Sostituisco il cookie con la new session. La admin session originale
  // resta in DB con revokedAt=NULL (viva, sospesa logicamente).
  const token = await signToken({ sid: newSession.id });
  (await cookies()).set("session", token, {
    expires: newSession.expiresAt,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
  });

  // Audit log sull'admin user (chi ha eseguito l'azione).
  await db.insert(activityLogs).values({
    userId: adminUser.id,
    action: ActivityType.ADMIN_IMPERSONATE_START,
    ipAddress: ip ?? "",
  });

  // L'admin entra nel front utente.
  redirect("/");
}

export async function adminStopImpersonation(): Promise<ImpersonateResult> {
  const current = await getSession();
  if (!current) {
    return { ok: false, error: "Nessuna sessione attiva." };
  }
  if (!current.impersonatorSessionId) {
    return { ok: false, error: "La sessione corrente non e' un'impersonation." };
  }

  // Revoca la session impersonata (current). Ripristino il cookie col
  // sid admin originale.
  await revokeSession(current.sessionId);
  const adminToken = await signToken({ sid: current.impersonatorSessionId });

  // Recupero l'expiresAt admin per riallineare il cookie. Se la session
  // admin non e' piu' valida (rara: scaduta nel frattempo), il prossimo
  // getSession ritornera' null e l'utente sara' logged-out naturalmente.
  const [adminSession] = await db
    .select({
      expiresAt: sessionsTable.expiresAt,
      userId: sessionsTable.userId,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, current.impersonatorSessionId))
    .limit(1);

  if (adminSession) {
    (await cookies()).set("session", adminToken, {
      expires: adminSession.expiresAt,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    // Audit log: ADMIN_IMPERSONATE_STOP sull'admin user originale.
    await db.insert(activityLogs).values({
      userId: adminSession.userId,
      action: ActivityType.ADMIN_IMPERSONATE_STOP,
      ipAddress: "",
    });
  } else {
    // Admin session sparita nel frattempo (revocata da altra tab, ecc.):
    // cancello il cookie, l'utente dovra' ri-loggarsi.
    (await cookies()).delete("session");
  }

  redirect(await getAdminPath("users-list"));
}
