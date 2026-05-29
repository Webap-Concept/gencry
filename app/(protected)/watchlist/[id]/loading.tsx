import { WatchlistDetailSkeleton } from "./_components/watchlist-detail-skeleton";

export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto py-6">
      <WatchlistDetailSkeleton />
    </div>
  );
}
