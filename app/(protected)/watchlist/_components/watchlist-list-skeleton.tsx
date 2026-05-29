// Skeleton per la lista watchlist. Mostrato dal Suspense durante il
// fetch (server) e dal loading.tsx route. Riproduce lo skeleton di una
// page header + 4 card placeholder.

export function WatchlistListSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      {/* Header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-7 w-48 rounded bg-gc-bg-3" />
          <div className="h-3 w-80 rounded bg-gc-bg-3" />
        </div>
        <div className="h-9 w-36 rounded-full bg-gc-bg-3" />
      </div>

      {/* Cards skeleton (4 placeholders, 2x2) */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="bg-gc-bg-2 border border-gc-line rounded-2xl p-4 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-gc-bg-3" />
                <div className="h-3 w-24 rounded bg-gc-bg-3" />
              </div>
              <div className="w-7 h-7 rounded bg-gc-bg-3" />
            </div>
            <div className="flex items-end justify-between">
              <div className="space-y-2">
                <div className="h-7 w-20 rounded bg-gc-bg-3" />
                <div className="h-2 w-10 rounded bg-gc-bg-3" />
              </div>
              <div className="flex -space-x-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="w-6 h-6 rounded-full bg-gc-bg-3 ring-2 ring-gc-bg-2"
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-gc-line pt-3 flex items-center justify-between">
              <div className="h-2 w-16 rounded bg-gc-bg-3" />
              <div className="h-2 w-16 rounded bg-gc-bg-3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
