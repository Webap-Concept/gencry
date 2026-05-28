// Skeleton detail watchlist: header card + lista 5 coin placeholder.
export function WatchlistDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      <div className="h-3 w-32 rounded bg-gc-bg-3" />
      <div className="bg-gc-bg-2 border border-gc-line rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 rounded bg-gc-bg-3" />
            <div className="h-3 w-64 rounded bg-gc-bg-3" />
          </div>
          <div className="w-7 h-7 rounded bg-gc-bg-3" />
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-gc-line pt-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-7 w-20 rounded bg-gc-bg-3" />
              <div className="h-2 w-12 rounded bg-gc-bg-3" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gc-bg-2 border border-gc-line rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gc-line">
          <div className="h-3 w-16 rounded bg-gc-bg-3" />
          <div className="h-8 w-28 rounded-full bg-gc-bg-3" />
        </div>
        <ul>
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b border-gc-line last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-gc-bg-3" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-gc-bg-3" />
                <div className="h-2 w-12 rounded bg-gc-bg-3" />
              </div>
              <div className="space-y-1 text-right">
                <div className="h-3 w-16 rounded bg-gc-bg-3" />
                <div className="h-2 w-10 rounded bg-gc-bg-3 ml-auto" />
              </div>
              <div className="w-7 h-7 rounded bg-gc-bg-3" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
