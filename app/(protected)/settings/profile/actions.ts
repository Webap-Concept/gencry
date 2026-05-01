"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  validatedAction,
  validatedActionWithUser,
  type ActionState,
} from "@/lib/auth/middleware";
import { isUsernameBlacklisted } from "@/lib/auth/blacklist";
import { isUniqueConstraintError } from "@/lib/auth/race-condition";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, userProfiles } from "@/lib/db/schema";
import { uploadAvatarFromBuffer } from "@/lib/storage/avatars";
import { getUser } from "@/lib/db/queries";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Il nome è obbligatorio").max(100),
  lastName: z.string().trim().min(1, "Il cognome è obbligatorio").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Username minimo 3 caratteri")
    .max(50, "Username massimo 50 caratteri")
    .superRefine((value, ctx) => {
      const result = validateUsernameFormat(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.error });
      }
    }),
});

export const updateProfile = validatedActionWithUser(
  updateProfileSchema,
  async (data, _formData, user) => {
    const { firstName, lastName, username } = data;

    if (await isUsernameBlacklisted(username)) {
      return {
        error: "Questo username non è disponibile.",
      } satisfies ActionState;
    }

    try {
      await db
        .insert(userProfiles)
        .values({ userId: user.id, firstName, lastName, username })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: { firstName, lastName, username, updatedAt: new Date() },
        });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return {
          error: "Questo username è già in uso. Scegline un altro.",
        } satisfies ActionState;
      }
      throw err;
    }

    await db.insert(activityLogs).values({
      userId: user.id,
      action: ActivityType.UPDATE_ACCOUNT,
      ipAddress: "",
    });

    return { success: "Profilo aggiornato." } satisfies ActionState;
  },
);

export type UploadAvatarState = ActionState & { url?: string };

export async function uploadAvatar(
  _prevState: UploadAvatarState,
  formData: FormData,
): Promise<UploadAvatarState> {
  const user = await getUser();
  if (!user) return { error: "Non autenticato." };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Seleziona un'immagine." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Immagine troppo grande. Massimo 2 MB." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadAvatarFromBuffer(user.id, buffer, file.type);

  if ("error" in result) return { error: result.error };

  await db
    .update(userProfiles)
    .set({ avatarUrl: result.url, updatedAt: new Date() })
    .where(eq(userProfiles.userId, user.id));

  await db.insert(activityLogs).values({
    userId: user.id,
    action: ActivityType.AVATAR_UPDATED,
    ipAddress: "",
  });

  return { success: "Foto aggiornata.", url: result.url };
}

const removeAvatarSchema = z.object({});

export const removeAvatar = validatedAction(
  removeAvatarSchema,
  async () => {
    const user = await getUser();
    if (!user) return { error: "Non autenticato." } satisfies ActionState;

    await db
      .update(userProfiles)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(userProfiles.userId, user.id));

    await db.insert(activityLogs).values({
      userId: user.id,
      action: ActivityType.AVATAR_UPDATED,
      ipAddress: "",
    });

    return { success: "Foto rimossa." } satisfies ActionState;
  },
);
