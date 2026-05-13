"use server";

import { syncAppSettingsSnapshot } from "@/lib/config/snapshots";
import { revalidatePath } from "next/cache";

export type ResyncState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

/**
 * Manual re-sync action for the dashboard widget. Forces a fresh write of
 * the snapshot from current DB state — useful when:
 *  - first time setting up R2 (creates the snapshot file)
 *  - R2 had an outage and we want to verify fresh state
 *  - manual recovery after a known inconsistency
 *
 * Holds no advisory lock here: the inner update-path uses one, but a plain
 * re-sync just reads DB state once and writes once — last write wins is
 * fine because the function is single-purpose and admin-triggered.
 */
export async function resyncSnapshotAction(): Promise<ResyncState> {
  try {
    await syncAppSettingsSnapshot();
    revalidatePath("/admin");
    return { success: "Snapshot re-synced.", timestamp: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Re-sync failed.";
    return { error: message, timestamp: Date.now() };
  }
}
