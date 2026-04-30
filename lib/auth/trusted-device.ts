// lib/auth/trusted-device.ts
import { db } from "@/lib/db/drizzle";
import { trustedDevices } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

const DEVICE_COOKIE = "device_token";
const PENDING_AUTH_COOKIE = "pending_device_auth";
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 anno in secondi
const PENDING_AUTH_EXPIRY_MS = 10 * 60 * 1000; // 10 minuti

const key = new TextEncoder().encode(process.env.AUTH_SECRET);

// ---------------------------------------------------------------------------
// Device token cookie
// ---------------------------------------------------------------------------

export async function getDeviceToken(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}

export async function setDeviceTokenCookie(token: string): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DEVICE_COOKIE_MAX_AGE,
    path: "/",
  });
}

// ---------------------------------------------------------------------------
// Trusted device DB operations
// ---------------------------------------------------------------------------

export function generateDeviceToken(): string {
  return randomUUID();
}

export async function isTrustedDevice(
  userId: string,
  deviceToken: string,
): Promise<boolean> {
  const [record] = await db
    .select({ id: trustedDevices.id })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.deviceToken, deviceToken),
      ),
    )
    .limit(1);

  if (record) {
    await db
      .update(trustedDevices)
      .set({ lastUsedAt: new Date() })
      .where(eq(trustedDevices.id, record.id));
    return true;
  }
  return false;
}

export async function addTrustedDevice(
  userId: string,
  deviceToken: string,
  userAgent?: string,
): Promise<void> {
  await db
    .insert(trustedDevices)
    .values({ userId, deviceToken, userAgent })
    .onConflictDoNothing();
}

export async function getTrustedDevices(userId: string) {
  return db
    .select()
    .from(trustedDevices)
    .where(eq(trustedDevices.userId, userId))
    .orderBy(trustedDevices.lastUsedAt);
}

export async function revokeTrustedDevice(
  deviceId: number,
  userId: string,
): Promise<void> {
  await db
    .delete(trustedDevices)
    .where(
      and(eq(trustedDevices.id, deviceId), eq(trustedDevices.userId, userId)),
    );
}

/**
 * Controlla se il dispositivo corrente è fidato per questo utente.
 * - Se l'utente non ha ancora nessun dispositivo salvato → primo login,
 *   restituisce isFirstDevice=true così il chiamante può auto-registrarlo.
 * - Se il token corrisponde a un dispositivo salvato → trusted.
 * - Altrimenti → non trusted, serve OTP.
 */
export async function checkDeviceTrust(
  userId: string,
  deviceToken: string | null,
): Promise<{ trusted: boolean; isFirstDevice: boolean }> {
  const existing = await db
    .select({ id: trustedDevices.id, deviceToken: trustedDevices.deviceToken })
    .from(trustedDevices)
    .where(eq(trustedDevices.userId, userId));

  if (existing.length === 0) {
    return { trusted: true, isFirstDevice: true };
  }

  if (deviceToken) {
    const match = existing.find((d) => d.deviceToken === deviceToken);
    if (match) {
      await db
        .update(trustedDevices)
        .set({ lastUsedAt: new Date() })
        .where(eq(trustedDevices.id, match.id));
      return { trusted: true, isFirstDevice: false };
    }
  }

  return { trusted: false, isFirstDevice: false };
}

// ---------------------------------------------------------------------------
// Pending auth cookie — usato durante il flusso di verifica dispositivo.
// Contiene userId + role ma NON è una sessione valida per l'app.
// ---------------------------------------------------------------------------

type PendingAuthPayload = {
  userId: string;
  role: string;
  expires: string;
};

export async function setPendingAuthCookie(
  userId: string,
  role: string,
): Promise<void> {
  const expires = new Date(Date.now() + PENDING_AUTH_EXPIRY_MS);
  const payload: PendingAuthPayload = {
    userId,
    role,
    expires: expires.toISOString(),
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10 minutes")
    .sign(key);

  (await cookies()).set(PENDING_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires,
    path: "/",
  });
}

export async function getPendingAuth(): Promise<PendingAuthPayload | null> {
  const token = (await cookies()).get(PENDING_AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const data = payload as unknown as PendingAuthPayload;
    if (new Date() > new Date(data.expires)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function clearPendingAuthCookie(): Promise<void> {
  (await cookies()).delete(PENDING_AUTH_COOKIE);
}
