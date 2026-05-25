"use client";
// components/modules/posts/NewPostsBannerSlot.tsx
//
// Banner "X nuovi post · clicca per caricare" (pattern GetStream §6:
// niente prepend automatico, user-initiated reload).
//
// V2 (Tier 2 chiuso 2026-05-25):
//   - Subscribe Supabase Realtime postgres_changes INSERT su `posts`.
//     Filter server-side `visibility=in.(public,members)` per il feed
//     Discover loggato.
//   - Counter local-state incrementato per ogni INSERT con
//     `created_at > watermark` e `author_id !== viewerUserId`.
//   - Click → router.refresh() (re-fetch RSC con cache-aside feed-cache
//     TTL 60s) + scroll-to-top smooth + reset counter/watermark.
//   - Sticky top con z-STICKY così resta visibile durante lo scroll.
//   - Ticker feed kind: V2 ritorna null (banner solo su Discover). Sul
//     ticker feed il filtro per ticker mention richiederebbe lookup
//     extra JS per ogni INSERT (i ticker vivono in tabella separata) —
//     follow-up se utile.
//
// Stile: pill rounded-full, gradiente verde menta (--gc-green) scuro→
// chiaro 135°, testo bianco, shadow colorato per "lift". Hover lift +
// active press, transizione smooth. Pointer-events strutturato così
// l'area circostante (margine) NON blocca i click sul feed sotto.
//
// Resilience: Supabase non configurato o token-fetch fail → return null
// silenzioso (degraded mode). Il banner è una feature live "nice-to-
// have", non deve mai rompere /explore.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { generateSupabaseRealtimeToken } from "@/lib/auth/supabase-realtime-token";
import { Z } from "@/lib/ui/z-index";
import { type PostListPage } from "@/lib/modules/posts/types";

export type NewPostsBannerSlotProps = {
  /** Tab del feed sotto: discover o filtered-by-ticker. */
  feedKind: "discover" | "ticker";
  /** Ticker attivo se feedKind = "ticker". (V2 inutilizzato — banner
   *  attivo solo su discover.) */
  ticker?: string;
  /** Cursor iniziale del feed sotto. V2 lo usa solo per scoping logico
   *  futuro; il watermark è basato sul timestamp di mount. */
  initialPage?: PostListPage;
  /** User id del viewer — necessario per skippare i propri post nel
   *  conteggio. Anonimi non vedono /explore (rotta protected), quindi
   *  questo prop è sempre valorizzato in pratica. */
  viewerUserId: string;
};

type PostInsertPayload = {
  id: string;
  author_id: string;
  visibility: string;
  created_at: string;
  deleted_at: string | null;
};

export function NewPostsBannerSlot({
  feedKind,
  viewerUserId,
}: NewPostsBannerSlotProps) {
  const router = useRouter();
  const t = useTranslations("posts.new_posts_banner");
  const [count, setCount] = useState(0);
  // Watermark = timestamp di "punto da cui contare i nuovi post". Si
  // resetta su click (router.refresh segue, ma il watermark è già
  // aggiornato così non riconto in race condition).
  const watermarkRef = useRef<number>(Date.now());

  useEffect(() => {
    // Banner attivo solo per feed Discover. Ticker feed → no-op (vedi
    // commento al top).
    if (feedKind !== "discover") return;

    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const tokenRes = await generateSupabaseRealtimeToken();
      if (cancelled) return;
      if (tokenRes.ok) {
        await supabase.realtime.setAuth(tokenRes.data.token);
      }
      const channel = supabase
        .channel(`posts-feed-banner:${viewerUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "posts",
            // Filtro server-side: solo public + members. private +
            // followers non interessano il Discover feed.
            filter: "visibility=in.(public,members)",
          },
          (payload) => {
            const row = payload.new as PostInsertPayload;
            if (!row) return;
            // Skip post propri (UX: non bannerare il proprio invio).
            if (row.author_id === viewerUserId) return;
            // Skip post già soft-deleted (INSERT race con immediate
            // delete è raro, ma robusto).
            if (row.deleted_at) return;
            // Guard timestamp: il watermark può essere superato da un
            // INSERT più vecchio (DST/clock skew) — skip.
            const createdMs = new Date(row.created_at).getTime();
            if (Number.isFinite(createdMs) && createdMs < watermarkRef.current) {
              return;
            }
            setCount((c) => c + 1);
          },
        )
        .subscribe();
      channelRef = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef) {
        const sb = getBrowserSupabase();
        if (sb) sb.removeChannel(channelRef);
      }
    };
  }, [feedKind, viewerUserId]);

  const onClick = useCallback(() => {
    // Reset PRIMA del refresh: evita race condition tra l'evento dell'
    // ultimo INSERT e l'aggiornamento del watermark.
    setCount(0);
    watermarkRef.current = Date.now();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    router.refresh();
  }, [router]);

  if (count <= 0) return null;

  return (
    <div
      className="sticky pointer-events-none flex justify-center"
      style={{ top: "0.5rem", zIndex: Z.STICKY }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={t("aria_label")}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-white text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2"
        style={{
          background: "linear-gradient(135deg, #5da383 0%, #a3d3b9 100%)",
          boxShadow:
            "0 10px 28px -8px rgba(125, 190, 158, 0.65), 0 3px 10px rgba(18, 57, 40, 0.22)",
        }}
      >
        <ArrowUp size={14} strokeWidth={2.75} aria-hidden />
        <span>{t("label", { count })}</span>
      </button>
    </div>
  );
}
