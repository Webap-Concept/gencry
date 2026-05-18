import { redirect } from "next/navigation";
import { getEnabledLocales } from "@/lib/db/pages-queries";
import { getUser } from "@/lib/db/queries";
import { ProfileForm } from "./_components/profile-form";

export default async function ProfileSettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const locales = await getEnabledLocales();

  return (
    <ProfileForm
      initial={{
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        username: user.username ?? "",
        avatarUrl: user.avatarUrl ?? null,
        email: user.email,
        headline: user.headline ?? "",
        bio: user.bio ?? "",
        locale: user.locale ?? "",
      }}
      locales={locales.map((l) => ({
        code: l.code,
        nativeLabel: l.nativeLabel,
      }))}
    />
  );
}
