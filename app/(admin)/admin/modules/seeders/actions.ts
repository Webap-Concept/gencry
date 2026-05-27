"use server";
// app/(admin)/admin/modules/seeders/actions.ts
//
// Server Actions del modulo Seeders. Solo permission `modules:seeders`
// (NON auto-granted: solo SuperAdmin per default).
//
// Il run esegue in sequenza tutti i SeederContributor abilitati (vedi
// lib/modules/seeders/registry.ts). Aggiungere un contributor (es.
// comments futuri) è una riga in registry.ts + 1 flag in
// SeederOptions: questo file resta invariato.
//
// Cleanup rispetta lockdown su email pattern seed-%@seed.<APP_DOMAIN>.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import {
  cleanupSeedUsers,
  countSeedUsers,
  seedUsers,
} from "@/lib/modules/seeders/services/user-seeder";
import {
  SEEDER_CONTRIBUTORS,
  type SeedRunContext,
  type SeederOptions,
  type SeederRunOutput,
} from "@/lib/modules/seeders/registry";

const SAFETY_MAX_USERS = 500;
const SAFETY_MAX_POSTS_PER_USER = 50;

const RunSchema = z.object({
  userCount: z.number().int().min(1).max(SAFETY_MAX_USERS),
  postsPerUser: z.number().int().min(0).max(SAFETY_MAX_POSTS_PER_USER),
  withImages: z.boolean(),
  withBlocks: z.boolean(),
  withReactions: z.boolean(),
  withComments: z.boolean(),
  withCommentReactions: z.boolean(),
});

export type RunSeederResult =
  | { ok: true; counts: { usersCreated: number } & SeederRunOutput }
  | { ok: false; error: string };

export async function runSeederAction(
  input: z.input<typeof RunSchema>,
): Promise<RunSeederResult> {
  await requireAdminSectionPage("modules:seeders");

  const parsed = RunSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { userCount, ...rest } = parsed.data;
  const opts: SeederOptions = rest;

  try {
    const users = await seedUsers(userCount);

    const ctx: SeedRunContext = { users, postsMeta: [], commentsMeta: [] };

    // Accumulatore tipizzato. I contributor ritornano Partial<>; noi
    // li sommiamo nei field che ci interessano.
    const output: SeederRunOutput = {
      usersCreated: users.length,
      postsCreated: 0,
      blocksCreated: 0,
      reactionsCreated: 0,
      commentsCreated: 0,
      commentReactionsCreated: 0,
    };

    for (const contributor of SEEDER_CONTRIBUTORS) {
      if (!contributor.enabled(opts)) continue;
      const delta = await contributor.run(ctx, opts);
      if (delta.postsCreated)            output.postsCreated            += delta.postsCreated;
      if (delta.blocksCreated)           output.blocksCreated           += delta.blocksCreated;
      if (delta.reactionsCreated)        output.reactionsCreated        += delta.reactionsCreated;
      if (delta.commentsCreated)         output.commentsCreated         += delta.commentsCreated;
      if (delta.commentReactionsCreated) output.commentReactionsCreated += delta.commentReactionsCreated;
    }

    revalidatePath("/admin/modules/seeders");
    revalidatePath("/", "layout"); // feed/explore mostrano i nuovi post

    return { ok: true, counts: output };
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
