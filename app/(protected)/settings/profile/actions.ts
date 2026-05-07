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
import {
  addUsernameToBloom,
  checkUsernameAvailability,
  ensureBloomFilter,
} from "@/lib/bloom/bloom-filter";
import { db } from "@/lib/db/drizzle";
import { activityLogs, ActivityType, userProfiles, users } from "@/lib/db/schema";
import { uploadAvatarFromBuffer } from "@/lib/storage/avatars";
import { getUser } from "@/lib/db/queries";
import { isLocale } from "@/lib/i18n/config";
import { setLocaleCookie } from "@/lib/i18n/locale-cookie";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

const updateProfileSchema = z.object({
  firstName: z.string().trim().max(100).optional().default(""),
  lastName: z.string().trim().max(100).optional().default(""),
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
  bio: z.string().trim().max(160).optional().default(""),
  /** Locale preferito (es. "it", "en"). Stringa vuota = nessuna preferenza
   *  (segui il detection del proxy). Validato lato server contro la
   *  whitelist `LOCALES` di lib/i18n/config.ts. */
  locale: z.string().trim().max(5).optional().default(""),
});

export const updateProfile = validatedActionWithUser(
  updateProfileSchema,
  async (data, _formData, user) => {
    const { firstName, lastName, username, bio, locale } = data;

    // Lo username viene controllato (blacklist + bloom + DB) solo se è
    // cambiato rispetto a quello attuale. Confronto case-insensitive
    // perché il bloom normalizza a lowercase.
    const fullUser = await getUser();
    const currentUsername = fullUser?.username ?? null;
    const usernameChanged =
      currentUsername === null ||
      currentUsername.toLowerCase() !== username.toLowerCase();

    if (usernameChanged) {
      if (await isUsernameBlacklisted(username)) {
        return {
          error: "Questo username non è disponibile.",
        } satisfies ActionState;
      }

      await ensureBloomFilter();
      const availability = await checkUsernameAvailability(username);
      if (!availability.available) {
        return {
          error: "Questo username è già in uso. Scegline un altro.",
        } satisfies ActionState;
      }
    }

    try {
      await db
        .insert(userProfiles)
        .values({ userId: user.id, firstName, lastName, username, bio })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: { firstName, lastName, username, bio, updatedAt: new Date() },
        });
    } catch (err) {
      // Race condition: tra il check bloom/DB e l'UPDATE, qualcun altro
      // potrebbe aver preso lo stesso username. Il vincolo UNIQUE
      // ce lo dice in modo autoritativo.
      if (isUniqueConstraintError(err)) {
        return {
          error: "Questo username è appena stato preso da un altro utente. Scegline un altro.",
        } satisfies ActionState;
      }
      throw err;
    }

    if (usernameChanged) {
      // Best-effort: il bloom non supporta rimozioni, quindi il vecchio
      // username resta nel filter (false-positive che il DB-check ricaccia).
      try {
        await addUsernameToBloom(username);
      } catch (err) {
        console.error("[settings/profile] addUsernameToBloom failed:", err);
      }
    }

    // Locale preferito: scriviamo `users.locale` solo se valido (whitelist
    // LOCALES) o esplicitamente svuotato. Sync col cookie NEXT_LOCALE così
    // la preferenza vale anche da guest dopo il logout (e viene letta dal
    // proxy per le richieste subito successive).
    const localeChanged = (user.locale ?? "") !== locale;
    if (localeChanged) {
      const safeLocale = locale === "" ? null : isLocale(locale) ? locale : null;
      await db
        .update(users)
        .set({ locale: safeLocale, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      if (safeLocale) {
        await setLocaleCookie(safeLocale);
      }
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
