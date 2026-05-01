import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { AccountForm } from "./_components/account-form";

export default async function AccountSettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  return (
    <AccountForm
      initial={{
        email: user.email,
        pendingEmail: user.pendingEmail,
        hasPassword: user.passwordHash !== null,
      }}
    />
  );
}
