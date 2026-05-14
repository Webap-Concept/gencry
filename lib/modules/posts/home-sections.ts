// lib/modules/posts/home-sections.ts
//
// Sezioni che il modulo Posts contribuisce alla home loggata. Vedi
// lib/home/registry.ts: gli array vengono composti esplicitamente.
//
// Per la home anonima: il feed Discover pubblico sarà servito da una
// pagina dedicata `/feed` SEO-friendly (PR-9). Qui registriamo solo
// le entry per la home loggata (slot `home.main`).
import { PostsFeedSection, PostsFeedSectionSkeleton } from "@/components/modules/posts/PostsFeedSection";
import { getUser } from "@/lib/db/queries";
import type { HomeSection } from "@/lib/home/types";

export const POSTS_HOME_SECTIONS: HomeSection[] = [
  {
    key: "posts.main.feed",
    slot: "home.main",
    order: 10,
    Component: PostsFeedSection,
    Skeleton: PostsFeedSectionSkeleton,
    // Gate: solo utenti loggati. Anonimi non hanno la home loggata,
    // ma la difesa in profondità non guasta.
    isEnabled: async () => {
      const user = await getUser();
      return user !== null;
    },
  },
];
