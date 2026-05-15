"use server";
// app/(admin)/admin/modules/seeders/actions.ts
//
// Server Actions del modulo Seeders. Solo permission `modules:seeders`
// (NON auto-granted: solo SuperAdmin per default).
//
// Esegue tutti i SeederContributor registrati in registry.ts. Cleanup
// rispetta lockdown su email pattern seed-%@seed.<APP_DOMAIN>.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import {
  cleanupSeedUsers,
  countSeedUsers,
  seedUsers,
} from "@/lib/modules/seeders/services/user-seeder";
import { seedPostsForUsers } from "@/lib/modules/seeders/contributors/posts-contributor";
import { seedBlocksForUsers } from "@/lib/modules/seeders/contributors/blocks-contributor";

const SAFETY_MAX_USERS = 500;
const SAFETY_MAX_POSTS_PER_USER = 50;

const RunSchema = z.object({
  userCount: z.number().int().min(1).max(SAFETY_MAX_USERS),
  postsPerUser: z.number().int().min(0).max(SAFETY_MAX_POSTS_PER_USER),
  withImages: z.boolean(),
  withBlocks: z.boolean(),
});

export type RunSeederResult =
  | {
      ok: true;
      counts: {
        usersCreated: number;
        postsCreated: number;
        blocksCreated: number;
      };
    }
  | { ok: false; error: string };

export async function runSeederAction(
  input: z.input<typeof RunSchema>,
): Promise<RunSeederResult> {
  await requireAdminSectionPage("modules:seeders");

  const parsed = RunSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { userCount, postsPerUser, withImages, withBlocks } = parsed.data;

  try {
    const users = await seedUsers(userCount);

    const postsResult =
      postsPerUser > 0
        ? await seedPostsForUsers(users, { postsPerUser, withImages })
        : { created: 0 };

    const blocksResult = withBlocks
      ? await seedBlocksForUsers(users)
      : { created: 0 };

    revalidatePath("/admin/modules/seeders");
    revalidatePath("/", "layout"); // feed/explore mostrano i nuovi post

    return {
      ok: true,
      counts: {
        usersCreated: users.length,
        postsCreated: postsResult.created,
        blocksCreated: blocksResult.created,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return { ok: false, error: msg };
  }
}

export type CleanupSeederResult =
  | { ok: true; deletedUsers: number }
  | { ok: false; error: string };

export async function cleanupSeederAction(): Promise<CleanupSeederResult> {
  await requireAdminSectionPage("modules:seeders");

  try {
    const result = await cleanupSeedUsers();
    revalidatePath("/admin/modules/seeders");
    revalidatePath("/", "layout");
    return { ok: true, deletedUsers: result.deleted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return { ok: false, error: msg };
  }
}

export async function getSeederCountsAction(): Promise<{
  seedUsersCount: number;
}> {
  await requireAdminSectionPage("modules:seeders");
  const n = await countSeedUsers();
  return { seedUsersCount: n };
}
