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
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useViewer } from "@/components/auth/ViewerProvider";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Flag,
  MessageCircle,
  MessageCircleOff,
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { PostMediaGallery } from "./PostMediaGallery";
import { PostComposerModal } from "./PostComposerModal";
import { PublishedPostToast } from "./PublishedPostToast";
import { ReactionPopover } from "./ReactionPopover";
import { ReportContentDialog } from "./ReportContentDialog";
import { BlockUserConfirmDialog } from "./BlockUserConfirmDialog";
import { DeletePostConfirmDialog } from "./DeletePostConfirmDialog";
import type { TickerPreviewData } from "@/lib/modules/posts/ticker-preview-actions";

// Lazy-load del thread commenti: ~30KB di JS + dipendenze Supabase
// Realtime non gravano sul bundle iniziale del feed. Mount on first
// expand (`commentsOpen=true`).
const CommentsThreadLazy = dynamic(
  () =>
    import("./CommentsThread").then((m) => ({ default: m.CommentsThread })),
  {
    ssr: false,
    loading: () => (
      <div className="mt-3 py-4 text-center text-xs text-gc-fg-muted">…</div>
    ),
  },
);

function authorDisplayName(
  author: PostCardData["author"],
  fallback: string,
): string {
  // Priorità: nome+cognome se presenti (UX più umana, ridotto noise di
  // @username). Username come fallback SENZA chiocciola — la `@` resta
  // riservata alle mention nel body. Pattern allineato a LinkedIn.
  const full = [author.firstName, author.lastName].filter(Boolean).join(" ");
  if (full) return full;
  if (author.username) return author.username;
  return fallback;
}

// Formatter time relativo. Riceve `t` (namespace "posts.time") + locale BCP-47
// (es. "it-IT", "en-US") per il fallback toLocaleDateString quando l'età
// supera 7 giorni.
function formatRelativeTime(
  date: Date,
  t: (key: string, values?: Record<string, number>) => string,
  locale: string,
): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("now");
  if (sec < 3600) return t("minutes_short", { n: Math.floor(sec / 60) });
  if (sec < 86_400) return t("hours_short", { n: Math.floor(sec / 3600) });
  if (sec < 604_800) return t("days_short", { n: Math.floor(sec / 86_400) });
  return new Date(date).toLocaleDateString(locale, {
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
  /**
   * Callback alternativa ai redirectAfter* — se passata, viene chiamata
   * dopo delete/block confermati invece di fare router.replace. Usata
   * dalla modale intercepting per chiudere lo slot (router.back).
   */
  onDeleted?: () => void;
  onBlocked?: () => void;
  /**
   * Mappa lower-name → SYMBOL caricata dal Server Component padre per
   * il match implicito dei coin nel PostBody. Propagata sia al body
   * principale sia al `repostOf` embed. Senza, solo `$TICKER` espliciti
   * vengono linkati.
   */
  coinNameMap?: Record<string, string>;
  /**
   * Preview ticker pre-fetched server-side (batch). Propagata al
   * TickerHoverCard tramite PostBody per primo hover zero-latency.
   */
  tickerPreviewMap?: Record<string, TickerPreviewData>;
  /**
   * Se settato (variant "feed"), il bottone "Commenta" diventa un
   * toggle che espande inline il thread sotto la card invece di
   * navigare a /post/{id}. Mounta `<CommentsThread>` lazily (dynamic
   * import) → zero impatto sul bundle del feed initial render.
   *
   * Se omesso, fallback al comportamento storico: Link a /post/{id}.
   */
  commentsThreadProps?: {
    viewerUserId?: string;
    viewerProfile?: {
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      headline: string | null;
    };
    liveMode: "subscribe" | "poll" | "off";
    pollIntervalSeconds: number;
    repliesInitialCount: number;
    maxBodyLength: number;
  };
};

export function PostCard({
  post,
  isAuthor,
  variant = "feed",
  editWindowMs = EDIT_WINDOW_MS_DEFAULT,
  redirectAfterBlock,
  redirectAfterDelete,
  onDeleted,
  onBlocked,
  coinNameMap,
  tickerPreviewMap,
  commentsThreadProps,
}: Props) {
  const router = useRouter();
  const viewer = useViewer();
  const t = useTranslations("posts");
  const tCard = useTranslations("posts.card");
  const tVis = useTranslations("posts.visibility");
  const tTime = useTranslations("posts.time");
  const locale = useLocale();
  const userFallback = t("common.user_fallback");
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

  // Pattern "confirmed + optimistic" (React 19) per reaction/counts/bookmark:
  // - `confirmedX` (useState) sopravvive alla fine della transition e tiene
  //   il "valore vero" lato client. Viene aggiornato manualmente DOPO che
  //   il server action ritorna ok.
  // - `optimisticX` (useOptimistic) wrappa confirmed: durante la pending
  //   transition mostra l'anteprima; appena la transition decade torna a
  //   confirmed (che, dopo il successo, è già il valore nuovo → niente
  //   "flash back" alla reaction precedente). Rollback su fail = gratuito:
  //   non aggiorniamo confirmed e l'ottimistico decade da solo.
  // Senza il "confirmed", useOptimistic torna al passthrough = prop `post`
  // che NON cambia (niente router.refresh): il bug era proprio quello.
  const initialOwnReaction: PostReactionKind | null =
    post.viewer?.ownReactions?.[0] ?? null;
  const [confirmedBookmarked, setConfirmedBookmarked] = useState(
    post.viewer?.bookmarked ?? false,
  );
  const [bookmarked, setOptimisticBookmarked] =
    useOptimistic(confirmedBookmarked);
  const [confirmedReaction, setConfirmedReaction] = useState<
    PostReactionKind | null
  >(initialOwnReaction);
  const [ownReaction, setOptimisticReaction] =
    useOptimistic<PostReactionKind | null>(confirmedReaction);
  const [confirmedCounts, setConfirmedCounts] = useState<PostReactionCounts>(
    post.counts.reactions,
  );
  const [optimisticCounts, applyCountsDelta] = useOptimistic<
    PostReactionCounts,
    { remove?: PostReactionKind; add?: PostReactionKind }
  >(confirmedCounts, (state, delta) => {
    const next = { ...state };
    if (delta.remove) next[delta.remove] = Math.max(0, next[delta.remove] - 1);
    if (delta.add) next[delta.add] = next[delta.add] + 1;
    return next;
  });
  const reactionsTotal =
    optimisticCounts.like +
    optimisticCounts.bullish +
    optimisticCounts.bearish +
    optimisticCounts.to_the_moon +
    optimisticCounts.dump;
  const [deleted, setDeleted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Counter optimistic-display per i repost. Incrementato lato client
  // dopo successful publish del quote dal modale, senza refetch del feed.
  const [displayedRepostsCount, setDisplayedRepostsCount] = useState(
    post.counts.reposts,
  );
  // Body lungo nel feed: clamp a 8 righe + toggle "Mostra tutto / Riduci".
  // SOLO in variant "feed" (in single view il post va sempre intero).
  // Stessa heuristic di CommentItem ma soglia più generosa (post = 2000
  // char max vs commenti 1000): 500 char OR >8 newlines.
  const [postExpanded, setPostExpanded] = useState(false);
  // ID del quote appena pubblicato → mostra PublishedPostToast con link
  // al nuovo quote post (stesso pattern di NewPostButton).
  const [publishedQuoteId, setPublishedQuoteId] = useState<string | null>(null);
  // NB: deleteOpen/reportOpen/blockOpen DEVONO stare qui sopra
  // l'early return `if (deleted || blocked) return null` — altrimenti
  // dopo `setDeleted(true)` il render successivo salta questi useState
  // → React vede meno hooks del render precedente → minified error #300
  // ("Rendered fewer hooks than expected"). È esattamente il crash che
  // vedevamo eliminando un proprio post dal feed.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  // Inline expand del thread commenti (solo variant feed, gated da
  // `commentsThreadProps`). Mount lazy via dynamic() — il bundle del
  // thread non grava sul render iniziale del feed.
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Edit-window è dinamico: la finestra può scadere mentre l'utente
  // sta guardando la card. Forza re-render ogni 30s così "Modifica"
  // sparisce al passaggio del minuto 10.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isAuthor) return;
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [isAuthor]);

  // User per il composer (edit per gli autori, quote-repost per qualsiasi
  // utente loggato). useSWR cachato globale ⇒ 1 sola fetch di rete per
  // tutto il feed (stessa key di NewPostButton). Null = non loggato.
  const { data: currentUser } = useSWR<CurrentUser>(
    "/api/user",
    userFetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (deleted || blocked) return null;

  const onToggleReaction = (kind: PostReactionKind) => {
    const wasActive = confirmedReaction === kind;
    const previousOwn = confirmedReaction;
    const newReaction = wasActive ? null : kind;
    startTransition(async () => {
      setOptimisticReaction(newReaction);
      applyCountsDelta({
        remove: previousOwn ?? undefined,
        add: wasActive ? undefined : kind,
      });
      const res = await toggleReaction({ postId: post.id, reaction: kind });
      if (res.ok) {
        // Confermo il nuovo stato lato client così, quando la transition
        // decade, useOptimistic ritorna a `confirmed` = già il valore nuovo.
        setConfirmedReaction(newReaction);
        setConfirmedCounts((prev) => {
          const next = { ...prev };
          if (previousOwn) next[previousOwn] = Math.max(0, next[previousOwn] - 1);
          if (!wasActive) next[kind] = next[kind] + 1;
          return next;
        });
      }
      // Fail → niente setConfirmed: l'ottimistico decade naturalmente
      // e la UI torna al valore confirmed precedente (rollback gratis).
    });
  };

  const onToggleBookmark = () => {
    const next = !confirmedBookmarked;
    startTransition(async () => {
      setOptimisticBookmarked(next);
      const res = await toggleBookmark({ postId: post.id });
      if (res.ok) setConfirmedBookmarked(next);
    });
  };

  const onDelete = () => {
    if (!isAuthor) return;
    setDeleteOpen(true);
  };
  const onDeleteConfirmed = () => {
    setDeleteOpen(false);
    startTransition(async () => {
      // NB: NON facciamo `setDeleted(true)` qui PRIMA del await.
      // React batcha setDeleteOpen(false) + setDeleted(true) in un solo
      // commit → il PostCard ritorna null IMMEDIATAMENTE → la Radix
      // Dialog viene smontata a metà animazione di chiusura, scatena
      // un crash lato client ("Qualcosa è andato storto"). Aspettiamo
      // il server, poi nascondiamo localmente.
      const res = await softDeletePost({ postId: post.id });
      if (!res.ok) return;

      setDeleted(true);

      // Priority: onDeleted callback (modale → router.back) >
      // redirectAfterDelete (single page → "/") > router.refresh (feed).
      // Single-post page (variant="single") passa redirectAfterDelete="/"
      // così la URL morta non resta nella history (back skippa). Sul
      // feed, refresh forza il re-fetch RSC dopo revalidatePath del
      // server action — il FeedList riceve le nuove initialPosts senza
      // il post deleted, e useResetableListState aggiorna lo state.
      if (onDeleted) {
        onDeleted();
      } else if (redirectAfterDelete) {
        router.replace(redirectAfterDelete);
      } else {
        router.refresh();
      }
    });
  };

  const onReport = () => setReportOpen(true);

  // Block flow (mutual): conferma modale → action → nascondi card.
  // Lo stato `blocked` agisce come hide locale immediato (UX snappy);
  // il server invaliderà i feed così al prossimo paint la card sparisce
  // anche dagli altri tab. Il post puntuale (/post/[id]) ritornerà 404.
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
      if (onBlocked) {
        onBlocked();
      } else if (redirectAfterBlock) {
        router.replace(redirectAfterBlock);
      } else {
        router.refresh();
      }
    });
  };

  // Edit-window check: postedAt + 10min > now?
  const ageMs = nowTick - new Date(post.createdAt).getTime();
  const canEdit = Boolean(isAuthor) && ageMs < editWindowMs;

  // Click-on-card pattern (Twitter-style). Lo stretched-link <a> overlay
  // soffriva del bug "click veloce non passa, click tenuto sì": un
  // mousedown su un <p> selezionabile (PostBody) faceva entrare il
  // browser in text-selection mode, il mouseup veloce sullo stesso
  // punto restava col target = <p>, il click NON propagava al <Link>
  // absolute sopra. Tenendo premuto ~500ms il browser concludeva "no
  // selezione" e il click finalmente passava. Risolto sostituendo
  // l'overlay con onClick sull'<article>, che fa router.push solo se
  // (a) non c'è una selection attiva e (b) il click NON è dentro un
  // elemento interattivo (a, button, role=menuitem). Selection nativa
  // preservata, keyboard nav via Enter, role=link per a11y.
  const isClickable = variant === "feed";
  // I figli interattivi (header, footer, gallery) NON hanno più bisogno
  // di z-[1]: senza overlay absolute non c'è più lo stack da scavalcare.
  // Le classi `relative` restano dove servono per i loro internal
  // positioning, ma niente z-index richiesto.
  const interactiveClass = "relative";

  const navigateToPost = () => {
    const url = `/post/${post.id}`;
    // Anon: full navigation per saltare il parallel slot @modal del
    // layout (protected) che intercetta il client-side push e svuota
    // il render. Loggati: router.push (apre la modale intercept).
    if (!viewer.isLoggedIn) {
      window.location.assign(url);
    } else {
      router.push(url);
    }
  };

  const handleCardClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isClickable) return;
    // Skip se l'utente ha selezionato testo (vuole copiare, non navigare)
    const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
    if (sel && sel.toString().trim().length > 0) return;
    // Skip se il click è atterrato su un elemento interattivo
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'a, button, [role="menuitem"], [role="menu"], [role="button"], input, textarea, select',
      )
    ) {
      return;
    }
    navigateToPost();
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!isClickable) return;
    if (e.key === "Enter" && e.target === e.currentTarget) {
      navigateToPost();
    }
  };

  return (
    <>
      <article
        onClick={isClickable ? handleCardClick : undefined}
        onKeyDown={isClickable ? handleCardKeyDown : undefined}
        role={isClickable ? "link" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={isClickable ? tCard("open_post") : undefined}
        className={`relative bg-gc-bg-2 border border-gc-line rounded-xl p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent ${
          isClickable
            ? "cursor-pointer hover:bg-gc-bg-2/80 transition-colors"
            : ""
        }`}
      >

        {/* Header: autore + time + visibility */}
        <header className={`${interactiveClass} flex items-start gap-3 mb-3`}>
          <Link
            href={`/u/${post.author.username ?? post.author.id}`}
            className="shrink-0"
          >
            <UserAvatar
              user={{
                id: post.author.id,
                username: post.author.username,
                firstName: post.author.firstName,
                lastName: post.author.lastName,
                avatarUrl: post.author.avatarUrl,
              }}
              size={40}
            />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <Link
                href={`/u/${post.author.username ?? post.author.id}`}
                className="font-medium text-gc-fg hover:underline"
              >
                {authorDisplayName(post.author, userFallback)}
              </Link>
              <span className="text-xs text-gc-fg-muted">·</span>
              <time
                dateTime={String(post.createdAt)}
                className="text-xs text-gc-fg-muted"
              >
                {formatRelativeTime(post.createdAt, tTime, locale)}
              </time>
              {displayedEditedAt ? (
                <span
                  className="text-xs text-gc-fg-muted"
                  title={String(displayedEditedAt)}
                >
                  · {tCard("edited")}
                </span>
              ) : null}
              {displayedVisibility !== "public" ? (
                <span className="text-xs text-gc-fg-muted px-1.5 py-0.5 rounded bg-gc-line/40">
                  {tVis(displayedVisibility)}
                </span>
              ) : null}
            </div>
            {post.author.headline ? (
              <p className="text-xs text-gc-fg-muted truncate leading-tight mt-0.5">
                {post.author.headline}
              </p>
            ) : null}
          </div>
          {/* Top-right toolbar */}
          <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={tCard("options_menu")}
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
                  {bookmarked
                    ? tCard("bookmark_remove")
                    : tCard("bookmark_save")}
                </DropdownMenuItem>
                {variant === "feed" ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/post/${post.id}`}>
                      <ArrowUpRight size={16} strokeWidth={1.75} />
                      {tCard("open_post")}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {canEdit ? (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil size={16} strokeWidth={1.75} />
                    {tCard("edit")}
                  </DropdownMenuItem>
                ) : null}
                {!isAuthor ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onBlock}>
                      <UserMinus size={16} strokeWidth={1.75} />
                      {tCard("block_user", {
                        name: authorDisplayName(post.author, userFallback),
                      })}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onReport}>
                      <Flag size={16} strokeWidth={1.75} />
                      {tCard("report")}
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
                      {tCard("delete")}
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
        {(() => {
          const newlineCount = (displayedBody.match(/\n/g) ?? []).length;
          const isLong =
            variant === "feed" &&
            (displayedBody.length > 500 || newlineCount > 8);
          return (
            <>
              <div className={isLong && !postExpanded ? "line-clamp-8" : undefined}>
                <PostBody
                  body={displayedBody}
                  coinNameMap={coinNameMap}
                  tickerPreviewMap={tickerPreviewMap}
                />
              </div>
              {isLong ? (
                <button
                  type="button"
                  onClick={() => setPostExpanded((v) => !v)}
                  className="mt-1 text-xs font-medium text-gc-accent hover:underline"
                >
                  {postExpanded ? tCard("collapse") : tCard("expand")}
                </button>
              ) : null}
            </>
          );
        })()}

        {/* Media gallery: SI interactiveClass — le tile sono <button>
            e click apre il lightbox, non deve navigare al post. */}
        {post.media.length > 0 ? (
          <div className={interactiveClass}>
            <PostMediaGallery media={post.media} variant={variant} />
          </div>
        ) : null}

        {/* I ticker NON sono renderizzati come chip ridondanti: il
            PostBody parser già linka inline ogni `$TICKER` a
            /explore?ticker=. La lista post.tickers resta in dati per
            usi futuri (es. counter trending, ticker page meta). */}

        {/* Quote repost embed: cliccabile → naviga al TARGET (non al post
            repostante). Il wrapper è un div con role=link (no <Link> per
            evitare nested-anchor: PostBody renderizza link interni per
            ticker/mention). I link interni catturano il loro click; per
            l'area vuota dell'embed stopPropagation evita il bubble all'
            article parent (che andrebbe al post repostante). */}
        {post.repostOf ? (
          <div
            role="link"
            tabIndex={0}
            aria-label={tCard("open_post")}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (
                target.closest(
                  'a, button, [role="menuitem"], [role="menu"], [role="button"]',
                )
              ) {
                return;
              }
              const sel =
                typeof window !== "undefined" ? window.getSelection?.() : null;
              if (sel && sel.toString().trim().length > 0) return;
              e.stopPropagation();
              router.push(`/post/${post.repostOf!.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) {
                e.stopPropagation();
                router.push(`/post/${post.repostOf!.id}`);
              }
            }}
            className={`${interactiveClass} mt-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1 cursor-pointer hover:bg-gc-bg-1/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent`}
          >
            <div className="flex items-center gap-1 text-xs text-gc-fg-muted mb-1">
              <Repeat2 size={12} strokeWidth={1.75} aria-hidden />
              {authorDisplayName(post.repostOf.author, userFallback)}
            </div>
            <PostBody
              body={post.repostOf.body}
              coinNameMap={coinNameMap}
              tickerPreviewMap={tickerPreviewMap}
            />
            {/* Media compact: solo la prima image come preview, badge +N
                se ce ne sono altre. Niente lightbox/carousel — l'utente
                apre il target dove vede tutte le foto. */}
            {post.repostOf.media.length > 0 ? (
              <div className="mt-2 relative rounded-gc-sm overflow-hidden bg-gc-bg-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.repostOf.media[0].thumbUrl}
                  alt=""
                  className="w-full max-h-48 object-cover"
                  loading="lazy"
                />
                {post.repostOf.media.length > 1 ? (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-xs font-medium">
                    +{post.repostOf.media.length - 1}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : post.repostOfTombstone ? (
          <div className="mt-3 border border-gc-line/60 rounded-gc-sm p-3 bg-gc-bg-1 text-sm text-gc-fg-muted italic">
            {post.repostOfTombstone.reason === "not_visible"
              ? tCard("repost_tombstone_not_visible")
              : tCard("repost_tombstone")}
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
          {(() => {
            // Color stateful: se ci sono commenti, l'icona+count diventano
            // arancio (gc-accent). Se la thread è espansa, vince il chip
            // bg-gc-bg-3. Altrimenti grigio muted con hover standard.
            // Quando commentsDisabled=TRUE → icona "off" + non-clickable
            // (niente apertura thread, niente navigation), tooltip
            // localizzato. Il counter resta nascosto (è sempre 0).
            const hasComments = post.counts.comments > 0;
            if (post.commentsDisabled) {
              return (
                <span
                  role="status"
                  aria-label={tCard("comments_disabled_aria")}
                  title={tCard("comments_disabled_aria")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-gc-fg-muted/60 cursor-not-allowed"
                >
                  <MessageCircleOff size={18} strokeWidth={1.75} />
                </span>
              );
            }
            const baseCommentsCls = commentsOpen
              ? "bg-gc-line/50 text-gc-fg"
              : hasComments
                ? "text-gc-accent hover:bg-gc-line/40"
                : "text-gc-fg-muted hover:bg-gc-line/40 hover:text-gc-fg";
            return commentsThreadProps && variant === "feed" ? (
              <button
                type="button"
                aria-label={tCard("comments_aria", { count: post.counts.comments })}
                aria-expanded={commentsOpen}
                onClick={() => setCommentsOpen((o) => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition ${baseCommentsCls}`}
              >
                <MessageCircle size={18} strokeWidth={1.75} />
                {hasComments ? <span>{post.counts.comments}</span> : null}
              </button>
            ) : (
              <Link
                href={`/post/${post.id}`}
                aria-label={tCard("comments_aria", { count: post.counts.comments })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition ${baseCommentsCls}`}
              >
                <MessageCircle size={18} strokeWidth={1.75} />
                {hasComments ? <span>{post.counts.comments}</span> : null}
              </Link>
            );
          })()}
          <button
            type="button"
            aria-label={tCard("reposts_aria", { count: displayedRepostsCount })}
            onClick={() => setQuoteOpen(true)}
            disabled={!currentUser}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gc-line/40 ${
              displayedRepostsCount > 0 ? "text-gc-pos" : "text-gc-fg-muted"
            }`}
          >
            <Repeat2 size={18} strokeWidth={1.75} />
            {displayedRepostsCount > 0 ? (
              <span>{displayedRepostsCount}</span>
            ) : null}
          </button>
        </footer>

        {/* Inline comments thread (expand-on-click, lazy bundle).
            Gate: solo variant feed + caller ha passato commentsThreadProps.
            Render condizionato → niente WebSocket aperti finché non si
            clicca. Pattern non-disruptive: il banner realtime e il
            composer vivono dentro CommentsThread. */}
        {commentsOpen && commentsThreadProps && variant === "feed" ? (
          <div className="mt-3 pt-3 border-t border-gc-line/40 relative z-[1]">
            <CommentsThreadLazy
              postId={post.id}
              postVisibility={post.visibility}
              commentsDisabled={post.commentsDisabled}
              viewerUserId={commentsThreadProps.viewerUserId}
              viewerProfile={commentsThreadProps.viewerProfile}
              liveMode={commentsThreadProps.liveMode}
              pollIntervalSeconds={commentsThreadProps.pollIntervalSeconds}
              repliesInitialCount={commentsThreadProps.repliesInitialCount}
              maxBodyLength={commentsThreadProps.maxBodyLength}
              editWindowMs={editWindowMs}
              coinNameMap={coinNameMap}
            />
          </div>
        ) : null}
      </article>

      {/* Report dialog + block confirm: mounted solo per non-autori
          (l'autore non si segnala/blocca da solo). I dialog sono
          controllati → niente fetch finché non vengono aperti. */}
      {!isAuthor ? (
        <>
          <ReportContentDialog
            target={{ type: "post", id: post.id }}
            authorDisplayName={authorDisplayName(post.author, userFallback)}
            onWantsToBlockAuthor={onBlock}
            isOpen={reportOpen}
            onOpenChange={setReportOpen}
          />
          <BlockUserConfirmDialog
            authorDisplayName={authorDisplayName(post.author, userFallback)}
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

      {/* Quote repost modal: disponibile a tutti gli utenti loggati
          (anche self-repost — vedi pattern Twitter). Mount solo dopo
          il primo open per non istanziare Dialog/Composer su ogni card
          del feed. */}
      {quoteOpen ? (
        <PostComposerModal
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
          onPublished={(quoteId) => {
            setDisplayedRepostsCount((c) => c + 1);
            setPublishedQuoteId(quoteId);
            setQuoteOpen(false);
          }}
          user={currentUser ?? null}
          quoteTarget={{
            id: post.id,
            body: displayedBody,
            author: post.author,
          }}
        />
      ) : null}

      <PublishedPostToast
        postId={publishedQuoteId}
        onDismiss={() => setPublishedQuoteId(null)}
      />
    </>
  );
}
