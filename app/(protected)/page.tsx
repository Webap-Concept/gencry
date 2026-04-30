import { generatePageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth/session";
import LandingPage from "@/components/landing-page";
import { HeroGreeting } from "@/components/feed/HeroGreeting";
import { Ticker } from "@/components/feed/Ticker";
import { Moments } from "@/components/feed/Moments";
import { FeedList } from "@/components/feed/FeedList";
import { FEED } from "@/lib/feed/mock";
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
  // Lo shell 3-colonne (sidebar + right rail) è gestito da (protected)/layout.
  // Qui resta solo il container della colonna centrale.
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[640px] mx-auto animate-gc-screen">
      <HeroGreeting />
      <Ticker />
      <Moments />
      <FeedList initialFeed={FEED} />
    </div>
  );
}
