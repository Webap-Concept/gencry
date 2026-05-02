"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { getDeviceToken } from "@/lib/auth/trusted-device";
import { getSession } from "@/lib/auth/session";
import {
  revokeAllUserSessions,
  revokeSession,
} from "@/lib/auth/sessions";
import {
  revokeAllOtherDevices,
  revokeDevice,
} from "@/lib/account/devices";

// ---------------------------------------------------------------------------
// Revoca singolo dispositivo
// ---------------------------------------------------------------------------

const revokeDeviceSchema = z.object({
  deviceId: z.coerce.number().int().positive(),
});

export const revokeDeviceAction = validatedActionWithUser(
  revokeDeviceSchema,
  async (data, _formData, user) => {
    const currentDeviceToken = await getDeviceToken();
    const result = await revokeDevice({
      userId: user.id,
      deviceId: data.deviceId,
      currentDeviceToken,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    revalidatePath("/settings/security");
    return { success: "Dispositivo revocato." } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Revoca tutti gli altri dispositivi
// ---------------------------------------------------------------------------

const revokeAllOthersSchema = z.object({});

export const revokeAllOtherDevicesAction = validatedActionWithUser(
  revokeAllOthersSchema,
  async (_data, _formData, user) => {
    const currentDeviceToken = await getDeviceToken();
    const { revokedCount } = await revokeAllOtherDevices({
      userId: user.id,
      currentDeviceToken,
    });

    revalidatePath("/settings/security");

    if (revokedCount === 0) {
      return {
        success: "Nessun altro dispositivo da revocare.",
      } satisfies ActionState;
    }
    return {
      success:
        revokedCount === 1
          ? "1 dispositivo revocato."
          : `${revokedCount} dispositivi revocati.`,
    } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Revoca singola sessione (l'utente non può revocare quella corrente)
// ---------------------------------------------------------------------------

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid("Sessione non valida"),
});

export const revokeSessionAction = validatedActionWithUser(
  revokeSessionSchema,
  async (data, _formData, user) => {
    const current = await getSession();
    if (current && current.sessionId === data.sessionId) {
      return {
        error:
          "Non puoi revocare la sessione corrente. Per uscire effettua il logout.",
      } satisfies ActionState;
    }

    // Ownership check via WHERE id=$1 AND user_id=$2: una sessione di un
    // altro utente non viene revocata anche se l'attacker indovina il sid
    // (UUIDv4 = ~122 bit di entropia, praticamente impossibile, ma defense
    // in depth è gratis).
    await revokeSession(data.sessionId, user.id);

    revalidatePath("/settings/security");
    return { success: "Sessione revocata." } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Revoca tutte le altre sessioni
// ---------------------------------------------------------------------------

const revokeAllOtherSessionsSchema = z.object({});

export const revokeAllOtherSessionsAction = validatedActionWithUser(
  revokeAllOtherSessionsSchema,
  async (_data, _formData, user) => {
    const current = await getSession();
    const { revokedCount } = await revokeAllUserSessions({
      userId: user.id,
      exceptSessionId: current?.sessionId,
    });

    revalidatePath("/settings/security");

    if (revokedCount === 0) {
      return {
        success: "Nessun'altra sessione attiva.",
      } satisfies ActionState;
    }
    return {
      success:
        revokedCount === 1
          ? "1 sessione revocata."
          : `${revokedCount} sessioni revocate.`,
    } satisfies ActionState;
  },
);
