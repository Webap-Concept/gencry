"use client";
// components/social-graph/HomeNewPostsBanner.tsx
//
// Banner realtime "X nuovi post" sul feed Home (modulo social-graph
// PR3). Identical pattern a NewPostsBannerSlot (/explore) ma filtra
// JS-side su followingSet → conta solo eventi di autori che il viewer
// segue.
//
// Channel: riuso `feed:discover` (trigger DB posts_feed_broadcast_trg,
// vedi M_posts_010 + M_posts_011 per l'allargo a 'followers'). Niente
// nuovi topic, niente n+1 subscribe per-followee.
//
// Resilienza: Supabase non configurato / token fetch fallisce → return
// null silenzioso. Il banner e' nice-to-have, non deve mai rompere /.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { Z } from "@/lib/ui/z-index";

export type HomeNewPostsBannerProps = {
  viewerUserId: string;
  /** Set serializzato degli userId che il viewer segue. Il banner conta
   *  SOLO eventi con authorId in questo set. Snapshot al mount; un
   *  follow/unfollow in sessione non altera il banner finche' la pagina
   *  non viene refresh (acceptable per V1). */
  followingIds: string[];
};

type FeedBroadcastPayload = {
  postId: string;
  authorId: string;
  visibility: string;
  createdAt: string;
};

export function HomeNewPostsBanner({
  viewerUserId,
  followingIds,
}: HomeNewPostsBannerProps) {
  const router = useRouter();
  const t = useTranslations("posts.new_posts_banner");
  const [count, setCount] = useState(0);
  const watermarkRef = useRef<number>(Date.now());
  // Snapshot Set: stable per la lifetime del componente. Lookup O(1).
  const followingSetRef = useRef<Set<string>>(new Set(followingIds));

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    if (followingSetRef.current.size === 0) return;

    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const channel = supabase
        .channel("feed:discover")
        .on("broadcast", { event: "insert" }, (msg) => {
          const payload = (msg as { payload?: Record<string, unknown> })
            .payload;
          if (!payload) return;
          const row: FeedBroadcastPayload = {
            postId: typeof payload.postId === "string" ? payload.postId : "",
            authorId:
              typeof payload.authorId === "string" ? payload.authorId : "",
            visibility:
              typeof payload.visibility === "string" ? payload.visibility : "",
            createdAt:
              typeof payload.createdAt === "string" ? payload.createdAt : "",
          };
          if (!row.postId || !row.authorId || !row.createdAt) return;
          if (row.authorId === viewerUserId) return; // skip self-post
          // Gate following: conta solo se l'autore e' tra i seguiti.
          if (!followingSetRef.current.has(row.authorId)) return;
          // Guard timestamp.
          const createdMs = new Date(row.createdAt).getTime();
          if (
            Number.isFinite(createdMs) &&
            createdMs < watermarkRef.current
          ) {
            return;
          }
          setCount((c) => c + 1);
        })
        .subscribe();
      channelRef = channel;
    })();

    return () => {
      if (channelRef) {
        const sb = getBrowserSupabase();
        if (sb) sb.removeChannel(channelRef);
      }
    };
  }, [viewerUserId]);

  const onClick = useCallback(() => {
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
          background: "linear-gradient(0deg, #5da383 0%, #a3d3b9 100%)",
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
