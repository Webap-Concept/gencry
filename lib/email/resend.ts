// lib/email/resend.ts
import { getEmailFrom, getResendClient } from "./client";

export async function sendEmail({
  to,
  bcc,
  subject,
  html,
}: {
  to: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
}) {
  const resend = await getResendClient();
  const from = await getEmailFrom();

  // Resend's API accepts both string and string[] for to/bcc; we just
  // forward whatever we received. Empty arrays are skipped.
  const hasBcc = Array.isArray(bcc) ? bcc.length > 0 : !!bcc;

  return resend.emails.send({
    from,
    to,
    ...(hasBcc ? { bcc } : {}),
    subject,
    html,
  });
}
