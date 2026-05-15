"use client";
// components/modules/posts/PostCard.tsx
//
// Card presentational riusabile di un post. Riceve PostCardData
// hydratato (vedi lib/modules/posts/types.ts).
//
// Layout v3 (2026-05-14, post-audit):
//   - Card-level click NON usa più e.target.closest() blacklist.
//     Pattern "stretched-link": un <Link> assoluto inset-0 sotto i
//     contenuti cattura il click sui pixel "vuoti" della card. Gli
//     elementi interattivi (avatar, username, dropdown, X, gallery,
//     reactions, ecc.) sono `relative z-[1]` SOPRA l'overlay e
//     ricevono il click per primi → no escape via closest().
//   - Autore può Modificare (entro edit_window_minutes) via menu ⋯
//     che apre PostComposerModal in mode "edit", body+visibility
//     pre-popolati. Visibility cambiabile solo verso più restrittivo.
//
//  Variant:
//   "feed"   — overlay link attivo, gallery=carousel
//   "single" — niente overlay (siamo già su /post/{id}), gallery=grid
import {
  startTransition,
  useEffect,
  useOptimistic,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Trash2,
  UserMinus,
} from "lucide-react";
import type { PostCardData, PostReactionCounts } from "@/lib/modules/posts/types";
import type { PostReactionKind } from "@/lib/db/schema";
import {
  softDeletePost,
  toggleBookmark,
  toggleReaction,
  toggleUserBlock,
} from "@/lib/modules/posts/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostBody } from "./PostBody";
import { PostMediaGallery } from "./PostMediaGallery";
import { PostComposerModal } from "./PostComposerModal";
import { ReactionPopover } from "./ReactionPopover";
import { ReportPostDialog } from "./ReportPostDialog";
import { BlockUserConfirmDialog } from "./BlockUserConfirmDialog";
import { DeletePostConfirmDialog } from "./DeletePostConfirmDialog";

const VISIBILITY_LABEL: Record<PostCardData["visibility"], string> = {
  public: "Tutti",
  members: "Community",
  followers: "Chi mi segue",
  private: "Solo io",
};

function authorDisplayName(author: PostCardData["author"]): string {
  if (author.username) return `@${author.username}`;
  const full = [author.firstName, author.lastName].filter(Boolean).join(" ");
  return full || "Utente";
}

function authorInitial(author: PostCardData["author"]): string {
  const f = (author.username ?? author.firstName ?? "?")[0] ?? "?";
  return f.toUpperCase();
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604_800) return `${Math.floor(sec / 86_400)}g`;
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

type CurrentUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

const userFetcher = (url: string) => fetch(url).then((r) => r.json());

const EDIT_WINDOW_MS_DEFAULT = 10 * 60 * 1000;

type Props = {
  post: PostCardData;
  /** True quando viewer === author. */
  isAuthor?: boolean;
  /**
   * "feed"   — overlay link verso /post/{id}, gallery carousel
   * "single" — niente overlay (no nav su sé stessi), gallery stack
   */
  variant?: "feed" | "single";
  /**
   * Edit window in millisecondi (default 10min). Il PostsFeedSection
   * potrà in futuro passare il valore da app_settings; per ora il
   * default basta perché matcha modules.posts.edit_window_minutes.
   */
  editWindowMs?: number;
  /**
   * Se settato, dopo un block confermato dell'autore il PostCard
   * naviga a questo path (es. "/" per portare l'utente al feed dopo
   * aver bloccato dalla pagina singolo post). Default `undefined` →
   * solo optimistic hide locale (UX feed).
   */
  redirectAfterBlock?: string;
  /**
   * Speculare a redirectAfterBlock ma per soft-delete del proprio
   * post: la single-post page passa "/", il feed non lo passa.
   */
  redirectAfterDelete?: string;
};

export function PostCard({
  post,
  isAuthor,
  variant = "feed",
  editWindowMs = EDIT_WINDOW_MS_DEFAULT,
  redirectAfterBlock,
  redirectAfterDelete,
}: Props) {
  const router = useRouter();
  // Optimistic display state per body/visibility/editedAt: dopo
  // edit successo aggiorniamo questi 3 senza dover ri-fetchare il
  // post dal server. Il modal in riapertura usa displayedBody come
  // initial (non più post.body) così non vede mai contenuto stale.
  const [displayedBody, setDisplayedBody] = useState(post.body);
  const [displayedVisibility, setDisplayedVisibility] = useState(
    post.visibility,
  );
  const [displayedEditedAt, setDisplayedEditedAt] = useState<Date | null>(
    post.editedAt,
  );

  const [bookmarked, setBookmarked] = useOptimistic(
    post.viewer?.bookmarked ?? false,
  );
  const initialOwnReaction: PostReactionKind | null =
    post.viewer?.ownReactions?.[0] ?? null;
  const [ownReaction, setOwnReaction] = useOptimistic<PostReactionKind | null>(
    initialOwnReaction,
  );
  const [optimisticCounts, applyCountsDelta] = useOptimistic<
    PostReactionCounts,
    { remove?: PostReactionKind; add?: PostReactionKind }
  >(post.counts.reactions, (state, delta) => {
    const next = { ...state };
    if (delta.remove) next[delta.remove] = Math.max(0, next[delta.remove] - 1);
    if (delta.add) next[delta.add] = next[delta.add] + 1;
    return next;
  });
  const reactionsTotal =
    optimisticCounts.like +
    optimisticCounts.rocket +
    optimisticCounts.bull +
    optimisticCounts.bear +
    optimisticCounts.dump +
    optimisticCounts.diamond;
  const [deleted, setDeleted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Edit-window è dinamico: la finestra può scadere mentre l'utente
  // sta guardando la card. Forza re-render ogni 30s così "Modifica"
  // sparisce al passaggio del minuto 10.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isAuthor) return;
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [isAuthor]);

  // User per il composer in edit: fetch solo se l'utente è autore (non
  // serve a non-autori). useSWR cachato globale ⇒ 1 sola fetch per N card.
  const { data: currentUser } = useSWR<CurrentUser>(
    isAuthor ? "/api/user" : null,
    userFetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (deleted || blocked) return null;

  const onToggleReaction = (kind: PostReactionKind) => {
    const wasActive = ownReaction === kind;
    const previousOwn = ownReaction;
    startTransition(async () => {
      setOwnReaction(wasActive ? null : kind);
      applyCountsDelta({
        remove: previousOwn ?? undefined,
        add: wasActive ? undefined : kind,
      });
      const res = await toggleReaction({ postId: post.id, reaction: kind });
      if (!res.ok) setOwnReaction(initialOwnReaction);
    });
  };

  const onToggleBookmark = () => {
    startTransition(async () => {
      setBookmarked(!bookmarked);
      const res = await toggleBookmark({ postId: post.id });
      if (!res.ok) setBookmarked(post.viewer?.bookmarked ?? false);
    });
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const onDelete = () => {
    if (!isAuthor) return;
    setDeleteOpen(true);
  };
  const onDeleteConfirmed = () => {
    setDeleteOpen(false);
    startTransition(async () => {
      setDeleted(true);
      const res = await softDeletePost({ postId: post.id });
      if (!res.ok) {
        setDeleted(false);
        return;
      }
      // Single-post page (variant="single") passa redirectAfterDelete="/"
      // così la URL morta non resta nella history (back skippa). Sul
      // feed, refresh forza il re-fetch RSC dopo revalidatePath del
      // server action.
      if (redirectAfterDelete) {
        router.replace(redirectAfterDelete);
      } else {
        router.refresh();
      }
    });
  };

  const [reportOpen, setReportOpen] = useState(false);
  const onReport = () => setReportOpen(true);

  // Block flow (mutual): conferma modale → action → nascondi card.
  // Lo stato `blocked` agisce come hide locale immediato (UX snappy);
  // il server invaliderà i feed così al prossimo paint la card sparisce
  // anche dagli altri tab. Il post puntuale (/post/[id]) ritornerà 404.
  const [blockOpen, setBlockOpen] = useState(false);
  const onBlock = () => setBlockOpen(true);
  const onBlockConfirmed = () => {
    setBlockOpen(false);
    startTransition(async () => {
      setBlocked(true);
      const res = await toggleUserBlock({ blockedUserId: post.author.id });
      if (!res.ok) {
        setBlocked(false);
        return;
      }
      // Sulla single-post page (variant="single") il caller passa
      // redirectAfterBlock="/" e usiamo router.replace() così la post
      // page bloccata NON resta nella history (back → non torna su
      // una URL morta, l'utente atterra direttamente sul passo
      // precedente del flusso).
      //
      // Sul feed (no redirect) chiamiamo router.refresh() per
      // ripopolare la Router Cache di RSC: il server action ha già
      // chiamato revalidatePath('/', 'layout'), refresh forza il
      // re-fetch immediato del feed corrente.
      if (redirectAfterBlock) {
        router.replace(redirectAfterBlock);
      } else {
        router.refresh();
      }
    });
  };

  // Edit-window check: postedAt + 10min > now?
  const ageMs = nowTick - new Date(post.createdAt).getTime();
  const canEdit = Boolean(isAuthor) && ageMs < editWindowMs;

  // Stretched-link overlay attivo solo su variant="feed".
  const showOverlayLink = variant === "feed";
  // I figli interattivi devono essere SOPRA l'overlay (z-[1]).
  // I figli non-interattivi (body, ticker text container) restano
  // sotto z-1 e ricevono il click → l'overlay fa la nav.
  const interactiveClass = "relative z-[1]";

  return (
    <>
      <article
        className={`relative bg-gc-bg-2 border border-gc-line rounded-gc p-5 ${
          showOverlayLink
            ? "cursor-pointer hover:bg-gc-bg-2/80 transition-colors"
            : ""
        }`}
      >
        {/* Stretched-link overlay: cattura i click sui pixel "vuoti"
            della card. È visivamente sotto i figli interattivi (z-[1])
            ma sopra il body (che resta z-auto). */}
        {showOverlayLink ? (
          <Link
            href={`/post/${post.id}`}
            aria-label="Apri post"
            className="absolute inset-0 rounded-gc"
          />
        ) : null}

        {/* Header: autore + time + visibility */}
        <header className={`${interactiveClass} flex items-start gap-3 mb-3`}>
          <Link
            href={`/profile/${post.author.username ?? post.author.id}`}
            className="shrink-0"
          >
            {post.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.author.avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gc-line flex items-center justify-center text-sm text-gc-fg-muted">
                {authorInitial(post.author)}
              </div>
            )}
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <Link
                href={`/profile/${post.author.username ?? post.author.id}`}
                className="font-medium text-gc-fg hover:underline"
              >
                {authorDisplayName(post.author)}
              </Link>
              <span className="text-xs text-gc-fg-muted">·</span>
              <Link
                href={`/post/${post.id}`}
                className="text-xs text-gc-fg-muted hover:underline"
              >
                <time dateTime={String(post.createdAt)}>
                  {formatRelativeTime(post.createdAt)}
                </time>
              </Link>
              {displayedEditedAt ? (
                <span
                  className="text-xs text-gc-fg-muted"
                  title={String(displayedEditedAt)}
                >
                  · modificato
                </span>
              ) : null}
              {displayedVisibility !== "public" ? (
                <span className="text-xs text-gc-fg-muted px-1.5 py-0.5 rounded bg-gc-line/40">
                  {VISIBILITY_LABEL[displayedVisibility]}
                </span>
              ) : null}
            </div>
          </div>
          {/* Top-right toolbar */}
          <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Opzioni post"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gc-fg-muted hover:bg-gc-bg-3 hover:text-gc-fg"
                >
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[200px] bg-gc-modal-bg border-gc-modal-border text-gc-fg"
              >
                <DropdownMenuItem onSelect={onToggleBookmark}>
                  {bookmarked ? (
                    <BookmarkCheck size={16} strokeWidth={1.75} />
                  ) : (
                    <Bookmark size={16} strokeWidth={1.75} />
                  )}
                  {bookmarked ? "Rimuovi dai salvati" : "Salva post"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/post/${post.id}`}>
                    <ArrowUpRight size={16} strokeWidth={1.75} />
                    Apri post
                  </Link>
                </DropdownMenuItem>
                {canEdit ? (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil size={16} strokeWidth={1.75} />
                    Modifica post
                  </DropdownMenuItem>
                ) : null}
                {!isAuthor ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onBlock}>
                      <UserMinus size={16} strokeWidth={1.75} />
                      Blocca {authorDisplayName(post.author)}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onReport}>
                      <Flag size={16} strokeWidth={1.75} />
                      Segnala
                    </DropdownMenuItem>
                  </>
                ) : null}
                {isAuthor ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={onDelete}
                      className="text-gc-danger focus:text-gc-danger"
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                      Elimina post
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Body: NON interactiveClass — vogliamo che click su testo
            "vuoto" cada sull'overlay link verso /post/{id}. I Link
            interni a PostBody ($TICKER, @mention, URL) sono <a> nativi
            e catturano da soli il click. */}
        <PostBody body={displayedBody} />

        {/* Media gallery: SI interactiveClass — le tile sono <button>
            e click apre il lightbox, non deve navigare al post. */}
        {post.media.length > 0 ? (
          <div className={interactiveClass}>
            <PostMediaGallery media={post.media} variant={variant} />
          </div>
        ) : null}

        {/* Ticker chips: SI interactiveClass — sono <Link> a /explore */}
        {post.tickers.length > 0 ? (
          <div className={`${interactiveClass} flex flex-wrap gap-1.5 mt-3`}>
            {post.tickers.map((t) => (
              <Link
                key={t}
                href={`/explore?ticker=${t}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-gc-line/40 text-gc-fg hover:bg-gc-line/60"
              >
                ${t}
              </Link>
            ))}
          </div>
        ) : null}

        {/* Quote repost embed: lo lasciamo SOTTO l'overlay così click
            su area "vuota" dell'embed naviga al post repostante. Se in
            futuro vorremo che cliccare l'embed apra il TARGET, basta
            aggiungere un <Link> stretched dentro l'embed con z-[1]. */}
        {post.repostOf ? (
          <div className="mt-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1">
            <div className="flex items-center gap-1 text-xs text-gc-fg-muted mb-1">
              <Repeat2 size={12} strokeWidth={1.75} aria-hidden />
              {authorDisplayName(post.repostOf.author)}
            </div>
            <PostBody body={post.repostOf.body} />
          </div>
        ) : post.repostOfTombstone ? (
          <div className="mt-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1 text-sm text-gc-fg-muted italic">
            Post originale rimosso
          </div>
        ) : null}

        {/* Footer: 3 azioni — tutte interattive sopra l'overlay */}
        <footer className={`${interactiveClass} mt-4 flex items-center gap-1`}>
          <ReactionPopover
            ownReaction={ownReaction}
            counts={optimisticCounts}
            totalCount={reactionsTotal}
            onToggle={onToggleReaction}
          />
          <Link
            href={`/post/${post.id}`}
            aria-label={`Commenti${post.counts.comments > 0 ? `, ${post.counts.comments}` : ""}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gc-fg-muted hover:bg-gc-bg-3 hover:text-gc-fg transition"
          >
            <MessageCircle size={18} strokeWidth={1.75} />
            {post.counts.comments > 0 ? <span>{post.counts.comments}</span> : null}
          </Link>
          <button
            type="button"
            aria-label={`Repost${post.counts.reposts > 0 ? `, ${post.counts.reposts}` : ""}`}
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gc-fg-muted disabled:cursor-not-allowed"
          >
            <Repeat2 size={18} strokeWidth={1.75} />
            {post.counts.reposts > 0 ? <span>{post.counts.reposts}</span> : null}
          </button>
        </footer>
      </article>

      {/* Report dialog + block confirm: mounted solo per non-autori
          (l'autore non si segnala/blocca da solo). I dialog sono
          controllati → niente fetch finché non vengono aperti. */}
      {!isAuthor ? (
        <>
          <ReportPostDialog
            postId={post.id}
            authorDisplayName={authorDisplayName(post.author)}
            onWantsToBlockAuthor={onBlock}
            isOpen={reportOpen}
            onOpenChange={setReportOpen}
          />
          <BlockUserConfirmDialog
            authorDisplayName={authorDisplayName(post.author)}
            isOpen={blockOpen}
            onOpenChange={setBlockOpen}
            onConfirm={onBlockConfirmed}
          />
        </>
      ) : null}

      {/* Edit + delete confirm: mounted solo se autore. Delete è
          sempre disponibile per l'autore (l'edit window può scadere
          ma il delete no). */}
      {isAuthor ? (
        <>
          {canEdit ? (
            <PostComposerModal
              open={editOpen}
              onOpenChange={setEditOpen}
              onPublished={(_postId, edited) => {
                if (edited) {
                  // Optimistic-display: aggiorna lo state locale così
                  // l'UI riflette subito i nuovi valori senza refresh.
                  setDisplayedBody(edited.body);
                  setDisplayedVisibility(edited.visibility);
                  setDisplayedEditedAt(new Date());
                }
                setEditOpen(false);
              }}
              user={currentUser ?? null}
              editPayload={{
                postId: post.id,
                initialBody: displayedBody,
                initialVisibility: displayedVisibility,
              }}
            />
          ) : null}
          <DeletePostConfirmDialog
            isOpen={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={onDeleteConfirmed}
          />
        </>
      ) : null}
    </>
  );
}
