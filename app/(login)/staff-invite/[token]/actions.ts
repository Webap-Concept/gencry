"use server";

import { db } from "@/lib/db/drizzle";
import { staffInvitations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function declineInvitation(token: string) {
  const [invite] = await db
    .select({ id: staffInvitations.id, acceptedAt: staffInvitations.acceptedAt, declinedAt: staffInvitations.declinedAt })
    .from(staffInvitations)
    .where(eq(staffInvitations.token, token))
    .limit(1);

  if (!invite || invite.acceptedAt || invite.declinedAt) {
    redirect("/");
  }

  await db
    .update(staffInvitations)
    .set({ declinedAt: new Date() })
    .where(eq(staffInvitations.id, invite.id));

  redirect(`/staff-invite/${token}?declined=1`);
}
