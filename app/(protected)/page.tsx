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
  // Shell 3-colonne e container centrato sono gestiti dal layout (protected).
  // Qui restano solo le sezioni del feed con l'animazione di mount.
  return (
    <div className="animate-gc-screen">
      <HeroGreeting />
      <Ticker />
      <Moments />
      <FeedList initialFeed={FEED} />
    </div>
  );
}
