import AppNav from "@/components/app-nav";
import { PageShowRevalidator } from "@/components/pageshow-revalidator";
import { getSession } from "@/lib/auth/session";
import { Suspense } from "react";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Guest sulla landing coming-soon non vede la navbar app: la landing
  // e' un'esperienza full-screen autonoma. Solo gli utenti loggati hanno
  // bisogno della shell con AppNav.
  const session = await getSession();
  const isGuest = !session;

  if (isGuest) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-[var(--brand-bg)]">
      <PageShowRevalidator />
      <Suspense fallback={null}>
        <AppNav />
      </Suspense>
      <main className="pt-16 pb-20 md:pb-0">
        <Suspense fallback={null}>{children}</Suspense>
      </main>
    </div>
  );
}
