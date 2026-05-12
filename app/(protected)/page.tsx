import { Suspense } from "react";
import { generatePageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth/session";
import LandingPage from "@/components/landing-page";
import { SlotBoundary } from "@/components/feed/SlotBoundary";
import { SectionSkeleton } from "@/components/feed/SectionSkeleton";
import { resolveSlot } from "@/lib/home/registry";
import type { HomeSection } from "@/lib/home/types";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata("/");
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) return <LandingPage />;

  // Slot-based registry — vedi project_home_slot_registry.md.
  // Le sezioni vengono dichiarate in lib/home/core-sections.ts (core) e
  // in lib/modules/<slug>/home-sections.ts (moduli). Compose in
  // lib/home/registry.ts.
  //
  // NB: AppRightRail risolve i suoi slot autonomamente (home.rail.*),
  // qui orchestriamo solo gli slot della colonna centrale.
  const [hero, mainTop, main, mainBottom] = await Promise.all([
    resolveSlot("home.hero"),
    resolveSlot("home.main.top"),
    resolveSlot("home.main"),
    resolveSlot("home.main.bottom"),
  ]);

  return (
    <div className="animate-gc-screen space-y-6">
      {hero.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <SectionRenderer section={s} />
        </SlotBoundary>
      ))}
      {mainTop.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <Suspense fallback={s.Skeleton ? <s.Skeleton /> : <SectionSkeleton />}>
            <SectionRenderer section={s} />
          </Suspense>
        </SlotBoundary>
      ))}
      {main.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <Suspense fallback={s.Skeleton ? <s.Skeleton /> : <SectionSkeleton variant="list" />}>
            <SectionRenderer section={s} />
          </Suspense>
        </SlotBoundary>
      ))}
      {mainBottom.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <SectionRenderer section={s} />
        </SlotBoundary>
      ))}
    </div>
  );
}

/**
 * Render-wrapper async: una HomeSection ha `Component: () => JSX | Promise<JSX>`,
 * non renderizzabile direttamente come `<s.Component />` quando ritorna una
 * Promise. Questo helper invece await-a (è RSC) e ritorna il JSX risolto.
 */
async function SectionRenderer({ section }: { section: HomeSection }) {
  return await section.Component();
}
