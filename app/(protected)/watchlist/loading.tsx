import { WatchlistListSkeleton } from "./_components/watchlist-list-skeleton";

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <WatchlistListSkeleton />
    </div>
  );
}
