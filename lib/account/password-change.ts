// lib/account/password-change.ts
//
// Logica core per il cambio password da /settings/account. Re-auth con
// la password corrente, validazione delle regole di forza (stesso set di
// /sign-up), aggiornamento dell'hash. La invalidazione delle altre sessioni
// arriverà con PR-D quando ci sarà la tabella `sessions` server-side.

import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, users } from "@/lib/db/schema";
import { comparePasswords, hashPassword } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export type PasswordRuleId = "min" | "upper" | "number" | "special";

export const passwordRules: Array<{
  id: PasswordRuleId;
  label: string;
  test: (p: string) => boolean;
}> = [
  { id: "min", label: "Almeno 8 caratteri", test: (p) => p.length >= 8 },
  { id: "upper", label: "Una lettera maiuscola", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "Un numero", test: (p) => /[0-9]/.test(p) },
  {
    id: "special",
    label: "Un carattere speciale",
    test: (p) => /[^a-zA-Z0-9]/.test(p),
  },
];

export function isStrongPassword(password: string): boolean {
  return passwordRules.every((r) => r.test(password));
}

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
