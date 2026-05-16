// lib/modules/seeders/contributors/blocks-contributor.ts
//
// Crea relazioni di block mutuale random tra seed users. Pattern:
// circa il 3-5% dei seed users blocca un altro seed user random.
// Block è mutual (vedi schema posts_user_blocks) → una sola riga
// crea il muro per entrambe le direzioni.
import "server-only";

import { db } from "@/lib/db/drizzle";
import { postsUserBlocks } from "@/lib/db/schema";
import type { SeedUser } from "../services/user-seeder";

export async function seedBlocksForUsers(
  seedUsers: SeedUser[],
): Promise<{ created: number }> {
  if (seedUsers.length < 2) return { created: 0 };

  // Targeting ~5% delle coppie possibili (un block per ogni ~20 user).
  const blockCount = Math.max(1, Math.floor(seedUsers.length * 0.05));
  const seen = new Set<string>();
  const rows: Array<{ blockerId: string; blockedId: string }> = [];

  let attempts = 0;
  const maxAttempts = blockCount * 5;
  while (rows.length < blockCount && attempts < maxAttempts) {
    attempts += 1;
    const a = seedUsers[Math.floor(Math.random() * seedUsers.length)];
    const b = seedUsers[Math.floor(Math.random() * seedUsers.length)];
    if (a.id === b.id) continue;
    // Dedup pair (mutual: 1 sola direzione basta).
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ blockerId: a.id, blockedId: b.id });
  }

  if (rows.length === 0) return { created: 0 };

  await db
    .insert(postsUserBlocks)
    .values(rows)
    .onConflictDoNothing({
      target: [postsUserBlocks.blockerId, postsUserBlocks.blockedId],
    });

  return { created: rows.length };
}
