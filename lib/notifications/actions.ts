"use server";

import { getUserPermissions } from "@/lib/rbac/can";
import { requireAdmin } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";
import {
  dismissNotification,
  markAllRead,
  markRead,
  snoozeNotification,
} from "./queries";

const SUPERADMIN_MARKER = "__superadmin__";

async function getCurrentPermissions(): Promise<Set<string>> {
  const user = await requireAdmin();
  if (user.isAdmin) return new Set([SUPERADMIN_MARKER]);
  return getUserPermissions(user);
}

export async function markReadAction(id: string): Promise<void> {
  await requireAdmin();
  await markRead(id);
  revalidatePath("/admin", "layout");
}

export async function snoozeAction(id: string): Promise<void> {
  await requireAdmin();
  await snoozeNotification(id, 7);
  revalidatePath("/admin", "layout");
}

export async function dismissAction(id: string): Promise<void> {
  await requireAdmin();
  await dismissNotification(id);
  revalidatePath("/admin", "layout");
}

export async function markAllReadAction(): Promise<void> {
  const permissions = await getCurrentPermissions();
  await markAllRead(permissions);
  revalidatePath("/admin", "layout");
}
