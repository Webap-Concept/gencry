import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { ProfileForm } from "./_components/profile-form";

export default async function ProfileSettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  return (
    <ProfileForm
      initial={{
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        username: user.username ?? "",
        avatarUrl: user.avatarUrl ?? null,
        email: user.email,
      }}
    />
  );
}
