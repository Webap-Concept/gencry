import { generatePageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth/session";
import LandingPage from "@/components/landing-page";
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

  // Loggato: feed sociale (placeholder, viene popolato nei prossimi checkpoint)
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold">Feed</h1>
      <p className="text-sm opacity-70 mt-1">In costruzione.</p>
    </div>
  );
}
