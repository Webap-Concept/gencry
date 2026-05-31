import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getLinkedAccounts } from "@/lib/account/oauth-links";
import { getBusinessStatus } from "@/lib/account/business-profile";
import { AccountForm } from "./_components/account-form";

export default async function AccountSettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const [linked, business] = await Promise.all([
    getLinkedAccounts(user.id),
    getBusinessStatus(user.id),
  ]);

  return (
    <AccountForm
      initial={{
        email: user.email,
        pendingEmail: user.pendingEmail,
        hasPassword: user.passwordHash !== null,
        linkedAccounts: linked.map((l) => ({
          provider: l.provider,
          linkedAt: l.linkedAt.toISOString(),
        })),
        business: {
          accountType: business.accountType,
          company: business.company,
          latestRequest: business.latestRequest
            ? {
                status: business.latestRequest.status,
                reviewNote: business.latestRequest.reviewNote,
              }
            : null,
        },
      }}
    />
  );
}
