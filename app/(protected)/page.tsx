import { generatePageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth/session";
import LandingPage from "@/components/landing-page";
import { HeroGreeting } from "@/components/feed/HeroGreeting";
import { Ticker } from "@/components/feed/Ticker";
import { Moments } from "@/components/feed/Moments";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata("/");
}

export default async function HomePage() {
  const session = await getSession();

  // Guest: landing coming-soon (full-screen, niente AppNav)
  if (!session) {
    return <LandingPage />;
  }

  // Loggato: feed sociale.
  // Wiring intermedio: Hero + Ticker + Moments. Il feed list (CP5) e
  // il layout a 3 colonne con sidebar/right-rail (CP6) arrivano dopo.
  return (
    <div className="bg-gc-bg min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 animate-gc-screen">
        <HeroGreeting />
        <Ticker />
        <Moments />
      </div>
    </div>
  );
}
