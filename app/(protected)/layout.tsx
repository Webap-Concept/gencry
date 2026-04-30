import { AppBottomNav } from "@/components/layout/AppBottomNav";
import { AppRightRail } from "@/components/layout/AppRightRail";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageShowRevalidator } from "@/components/pageshow-revalidator";
import { getSession } from "@/lib/auth/session";
import { Suspense } from "react";

// Shell dell'area loggata: sidebar a sinistra (md+), feed centrale, right
// rail a destra (lg+); su mobile la nav passa al bottom-nav. I guest non
// vedono lo shell — la landing è full-screen autonoma.

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isGuest = !session;

  if (isGuest) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-gc-bg">
      <PageShowRevalidator />
      <div className="mx-auto max-w-[1440px] flex">
        <AppSidebar />
        <main className="flex-1 min-w-0 pb-20 md:pb-6">
          <Suspense fallback={null}>{children}</Suspense>
        </main>
        <AppRightRail />
      </div>
      <AppBottomNav />
    </div>
  );
}
