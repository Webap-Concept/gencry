// lib/modules/watchlist/home-sections.ts
//
// Sezioni che il modulo Watchlist contribuisce alla home loggata.
// Composte esplicitamente in lib/home/registry.ts.
//
// `watchlist.hero.featured`: la watchlist marcata `featured_in_feed`
// (max una per utente) renderizzata in cima al feed come barra
// espandibile. Slot `home.hero` (render inline, niente Suspense) → il
// Component ritorna null se l'utente non ha una featured, senza flash.
import {
  FeaturedWatchlistBar,
  FeaturedWatchlistBarSkeleton,
} from "@/components/modules/watchlist/featured-watchlist-bar";
import { getUser } from "@/lib/db/queries";
import type { HomeSection } from "@/lib/home/types";

export const WATCHLIST_HOME_SECTIONS: HomeSection[] = [
  {
    key: "watchlist.hero.featured",
    slot: "home.hero",
    order: 10,
    Component: FeaturedWatchlistBar,
    Skeleton: FeaturedWatchlistBarSkeleton,
    // Gate leggero: solo loggati (getUser è React.cache → 0 query extra).
    // Il "ha una featured?" lo decide il Component (ritorna null) per non
    // fare query custom nel gate — vedi regola in lib/home/types.ts.
    isEnabled: async () => {
      const user = await getUser();
      return user !== null;
    },
  },
];
