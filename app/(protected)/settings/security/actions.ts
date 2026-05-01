"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { getDeviceToken } from "@/lib/auth/trusted-device";
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
