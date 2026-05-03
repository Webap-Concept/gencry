"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  deleteAllResolvedNotFoundLogs,
  deleteNotFoundLog,
  markNotFoundResolved,
  markNotFoundUnresolved,
} from "@/lib/db/not-found-queries";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string; success?: boolean; cleared?: number };

export async function resolveNotFoundAction(id: number): Promise<ActionResult> {
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid id." };
  try {
    await markNotFoundResolved(id);
    revalidatePath(getAdminPath("seo-not-found"));
  } catch (err) {
    console.error("[resolveNotFoundAction]", err);
    return { error: "Failed to mark as resolved." };
  }
  return { success: true };
}

export async function reopenNotFoundAction(id: number): Promise<ActionResult> {
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid id." };
  try {
    await markNotFoundUnresolved(id);
    revalidatePath(getAdminPath("seo-not-found"));
  } catch (err) {
    console.error("[reopenNotFoundAction]", err);
    return { error: "Failed to reopen." };
  }
  return { success: true };
}

export async function deleteNotFoundAction(id: number): Promise<ActionResult> {
  if (!Number.isFinite(id) || id <= 0) return { error: "Invalid id." };
  try {
    await deleteNotFoundLog(id);
    revalidatePath(getAdminPath("seo-not-found"));
  } catch (err) {
    console.error("[deleteNotFoundAction]", err);
    return { error: "Failed to delete entry." };
  }
  return { success: true };
}

export async function clearResolvedNotFoundAction(): Promise<ActionResult> {
  try {
    const cleared = await deleteAllResolvedNotFoundLogs();
    revalidatePath(getAdminPath("seo-not-found"));
    return { success: true, cleared };
  } catch (err) {
    console.error("[clearResolvedNotFoundAction]", err);
    return { error: "Failed to clear resolved entries." };
  }
}
