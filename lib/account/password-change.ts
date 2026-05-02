// lib/account/password-change.ts
//
// Logica core per il cambio password da /settings/account. Re-auth con
// la password corrente, validazione delle regole di forza (stesso set di
// /sign-up), aggiornamento dell'hash. Dopo il successo, kick out di tutte
// le altre sessioni dell'utente (PR-D): l'utente resta loggato sul device
// corrente ma chi ha rubato un cookie altrove viene buttato fuori.

import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { comparePasswords, hashPassword } from "@/lib/auth/session";
import { revokeAllUserSessions } from "@/lib/auth/sessions";
import { isStrongPassword } from "@/lib/account/password-rules";
import { eq } from "drizzle-orm";

export type ChangePasswordResult =
  | { ok: true; revokedOtherSessions: number }
  | { ok: false; error: string };

/**
 * `currentSessionId` è la sessione che l'utente sta usando ora (presa da
 * `getSession()`). Se passata, la teniamo viva e revochiamo tutte le altre.
 * Se non passata (caller legacy), revochiamo TUTTE le sessioni: l'utente
 * dovrà rifare login anche sul device corrente. È un comportamento
 * accettabile ma meno gradevole.
 */
export async function changePassword(
  userId: string,
  currentPasswordHash: string | null,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
  currentSessionId?: string,
): Promise<ChangePasswordResult> {
  // OAuth-only senza password: non può cambiarla qui.
  if (currentPasswordHash === null) {
    return {
      ok: false,
      error: "Il tuo account non ha una password (accesso solo via Google).",
    };
  }

  const valid = await comparePasswords(currentPassword, currentPasswordHash);
  if (!valid) {
    return { ok: false, error: "La password attuale non è corretta." };
  }

  if (currentPassword === newPassword) {
    return {
      ok: false,
      error: "La nuova password deve essere diversa da quella attuale.",
    };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Le password non coincidono." };
  }

  if (!isStrongPassword(newPassword)) {
    return {
      ok: false,
      error: "La nuova password non rispetta i requisiti di sicurezza.",
    };
  }

  const newHash = await hashPassword(newPassword);
  await Promise.all([
    db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, userId)),
    db.insert(activityLogs).values({
      userId,
      action: ActivityType.UPDATE_PASSWORD,
      ipAddress: "",
    }),
  ]);

  const { revokedCount } = await revokeAllUserSessions({
    userId,
    exceptSessionId: currentSessionId,
  });

  return { ok: true, revokedOtherSessions: revokedCount };
}
