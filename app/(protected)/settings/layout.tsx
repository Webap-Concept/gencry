import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SettingsNav } from "./_components/settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] leading-[1.1] tracking-[-0.01em] text-gc-fg">
          Impostazioni
        </h1>
        <p className="text-[13.5px] text-gc-fg-3 mt-1">
          Gestisci profilo, account, sicurezza e privacy.
        </p>
      </div>

      <SettingsNav />

      <div>{children}</div>
    </div>
  );
}
