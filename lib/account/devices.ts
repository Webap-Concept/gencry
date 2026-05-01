// lib/account/devices.ts
//
// Logica account-level per la gestione dei "dispositivi fidati" dell'utente:
// listing per la UI in /settings/security, revoca singola e revoca-tutti-tranne-corrente.
//
// Differenza con lib/auth/trusted-device.ts: quel modulo gestisce il *flow*
// di trust durante login (cookie, OTP, primo dispositivo). Qui esponiamo
// invece le operazioni che l'utente compie consapevolmente da impostazioni.

import "server-only";
import { db } from "@/lib/db/drizzle";
import { trustedDevices } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { parseUserAgent, type ParsedUserAgent } from "./parse-user-agent";

export type UserDevice = {
  id: number;
  userAgent: string | null;
  parsed: ParsedUserAgent;
  createdAt: Date;
  lastUsedAt: Date;
  isCurrent: boolean;
};

/**
 * Ritorna la lista dei dispositivi fidati per l'utente, ordinata per
 * ultimo uso decrescente (corrente in cima quando presente).
 * `currentDeviceToken` viene usato solo per marcare il flag `isCurrent`,
 * mai per filtrare: l'utente deve poter vedere tutti i suoi dispositivi.
 */
export async function listMyDevices(
  userId: string,
  currentDeviceToken: string | null,
): Promise<UserDevice[]> {
  const rows = await db
    .select()
    .from(trustedDevices)
    .where(eq(trustedDevices.userId, userId));

  const mapped: UserDevice[] = rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    parsed: parseUserAgent(row.userAgent),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    isCurrent:
      currentDeviceToken !== null && row.deviceToken === currentDeviceToken,
  }));

  return mapped.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
  });
}

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Revoca un singolo dispositivo. Il filtro su userId protegge da IDOR:
 * un utente non può cancellare device di un altro anche se intercetta l'id.
 * La revoca del dispositivo corrente è bloccata: per uscire usa il logout.
 */
export async function revokeDevice(params: {
  userId: string;
  deviceId: number;
  currentDeviceToken: string | null;
}): Promise<ActionResult> {
  const { userId, deviceId, currentDeviceToken } = params;

  const [target] = await db
    .select({
      id: trustedDevices.id,
      deviceToken: trustedDevices.deviceToken,
    })
    .from(trustedDevices)
    .where(
      and(eq(trustedDevices.id, deviceId), eq(trustedDevices.userId, userId)),
    )
    .limit(1);

  if (!target) {
    return { ok: false, error: "Dispositivo non trovato." };
  }

  if (
    currentDeviceToken !== null &&
    target.deviceToken === currentDeviceToken
  ) {
    return {
      ok: false,
      error:
        "Non puoi revocare il dispositivo che stai usando. Per uscire da questo dispositivo effettua il logout.",
    };
  }

  await db
    .delete(trustedDevices)
    .where(
      and(eq(trustedDevices.id, deviceId), eq(trustedDevices.userId, userId)),
    );

  return { ok: true };
}

/**
 * Revoca tutti i dispositivi tranne quello corrente.
 * Se `currentDeviceToken` è null (utente senza cookie device, raro) revoca
 * tutto: l'utente sta comunque chiedendo esplicitamente "revoca tutti gli altri",
 * quindi includere il corrente è coerente — al massimo dovrà rifare il login.
 */
export async function revokeAllOtherDevices(params: {
  userId: string;
  currentDeviceToken: string | null;
}): Promise<{ revokedCount: number }> {
  const { userId, currentDeviceToken } = params;

  const condition =
    currentDeviceToken !== null
      ? and(
          eq(trustedDevices.userId, userId),
          ne(trustedDevices.deviceToken, currentDeviceToken),
        )
      : eq(trustedDevices.userId, userId);

  const deleted = await db.delete(trustedDevices).where(condition).returning({
    id: trustedDevices.id,
  });

  return { revokedCount: deleted.length };
}
