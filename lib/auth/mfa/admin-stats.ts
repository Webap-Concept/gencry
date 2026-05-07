import "server-only";

import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  mfaRecoveryCodes,
  userMfaTotp,
  users,
} from "@/lib/db/schema";
import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  isNotNull,
  isNull,
} from "drizzle-orm";

export interface MfaAdminStats {
  /** Utenti con MFA attivo (enabledAt non nullo). */
  enrolledUsers: number;
  /** Utenti totali (per calcolare % adoption). Esclude utenti banned. */
  totalUsers: number;
  /** Utenti con setup pendente (row in user_mfa_totp con enabledAt = NULL). */
  pendingSetups: number;
  /** Utenti staff (isAdmin=true) con MFA attivo. Per il "required-for-staff". */
  staffEnrolled: number;
  /** Utenti staff totali (per il count required-for-staff). */
  staffTotal: number;
  /** Recovery codes consumati negli ultimi 30 giorni. */
  recoveryCodesUsedLast30Days: number;
  /** Numero medio di recovery codes rimanenti per utente enrolled. */
  avgRecoveryCodesRemaining: number;
}

/**
 * Aggrega stats MFA per la pagina admin /admin/security/mfa.
 * Tutte le query in parallelo dove possibile.
 */
export async function getMfaAdminStats(): Promise<MfaAdminStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    enrolledRow,
    totalRow,
    pendingRow,
    staffEnrolledRow,
    staffTotalRow,
    recoveryUsedRow,
    unusedCodesRow,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(userMfaTotp)
      .where(isNotNull(userMfaTotp.enabledAt)),
    db.select({ n: count() }).from(users).where(isNull(users.bannedAt)),
    db
      .select({ n: count() })
      .from(userMfaTotp)
      .where(isNull(userMfaTotp.enabledAt)),
    db
      .select({ n: count() })
      .from(userMfaTotp)
      .innerJoin(users, eq(users.id, userMfaTotp.userId))
      .where(
        and(isNotNull(userMfaTotp.enabledAt), eq(users.isAdmin, true)),
      ),
    db.select({ n: count() }).from(users).where(eq(users.isAdmin, true)),
    db
      .select({ n: count() })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.action, ActivityType.MFA_RECOVERY_CODE_USED),
          gte(activityLogs.timestamp, thirtyDaysAgo),
        ),
      ),
    // Codici non usati in totale + utenti distinti che ne hanno almeno uno.
    // Media = totalUnused / distinctUsers. Approssimazione accettabile per
    // una stat indicativa: utenti enrolled con 0 codici rimasti non sono
    // conteggiati (l'admin lo vede comunque dal pendingSetups e dal pannello
    // per-utente).
    db
      .select({
        totalUnused: count(),
        distinctUsers: countDistinct(mfaRecoveryCodes.userId),
      })
      .from(mfaRecoveryCodes)
      .where(isNull(mfaRecoveryCodes.usedAt)),
  ]);

  const totalUnused = unusedCodesRow[0]?.totalUnused ?? 0;
  const distinctUsers = unusedCodesRow[0]?.distinctUsers ?? 0;
  const avgRecoveryCodesRemaining =
    distinctUsers > 0 ? totalUnused / distinctUsers : 0;

  return {
    enrolledUsers: enrolledRow[0]?.n ?? 0,
    totalUsers: totalRow[0]?.n ?? 0,
    pendingSetups: pendingRow[0]?.n ?? 0,
    staffEnrolled: staffEnrolledRow[0]?.n ?? 0,
    staffTotal: staffTotalRow[0]?.n ?? 0,
    recoveryCodesUsedLast30Days: recoveryUsedRow[0]?.n ?? 0,
    avgRecoveryCodesRemaining: Number(avgRecoveryCodesRemaining.toFixed(1)),
  };
}
