"use client";
// components/modules/posts/NewPostsBannerSlot.tsx
//
// Slot per il banner "X nuovi post · clicca per caricare" (pattern
// GetStream §6: niente prepend automatico, user-initiated reload).
//
// V1 (Tier 1): no-op invisibile. Esiste solo per fissare la posizione
// nel layout e permettere a Tier 2 di sostituire l'implementazione
// con `useFeedLiveSignal()` senza modificare la struttura di /explore.
//
// V2 (Tier 2): subscribe Supabase Realtime su `posts` filtro
// `visibility IN ('public','members')`, counter local-state che si
// incrementa su ogni INSERT, click → router.refresh() che ripopola il
// feed con i nuovi post.
import { type PostListPage } from "@/lib/modules/posts/types";

export type NewPostsBannerSlotProps = {
  /** Tab del feed sotto: discover o filtered-by-ticker. Useremo questa
   *  info in Tier 2 per decidere il filtro del Realtime subscription. */
  feedKind: "discover" | "ticker";
  /** Ticker attivo se feedKind = "ticker". */
  ticker?: string;
  /** Cursor iniziale del feed sotto (per il "watermark" da cui contare
   *  i nuovi post). V1 non lo usa, V2 sì. */
  initialPage?: PostListPage;
};

export function NewPostsBannerSlot(_props: NewPostsBannerSlotProps) {
  // V1 placeholder: nessun rendering. Il layout di /explore già
  // riserva lo spazio (margine sopra al feed).
  return null;
}
