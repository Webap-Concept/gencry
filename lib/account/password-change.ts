// lib/account/password-change.ts
//
// Logica core per il cambio password da /settings/account. Re-auth con
// la password corrente, validazione delle regole di forza (stesso set di
// /sign-up), aggiornamento dell'hash. La invalidazione delle altre sessioni
// arriverà con PR-D quando ci sarà la tabella `sessions` server-side.

import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { comparePasswords, hashPassword } from "@/lib/auth/session";
import { isStrongPassword } from "@/lib/account/password-rules";
import { eq } from "drizzle-orm";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function changePassword(
  userId: string,
  currentPasswordHash: string | null,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
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

  return { ok: true };
}
