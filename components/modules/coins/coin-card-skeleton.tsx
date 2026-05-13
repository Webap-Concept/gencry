// components/modules/coins/coin-card-skeleton.tsx
// Skeleton placeholder per la card coin durante Suspense / loading.
import { cn } from "@/lib/utils";

export function CoinCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 bg-gc-bg-2 border border-gc-line animate-pulse",
        className,
      )}
      aria-hidden>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gc-bg-3" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3 w-20 rounded bg-gc-bg-3" />
          <div className="h-2 w-12 rounded bg-gc-bg-3" />
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="space-y-2">
          <div className="h-5 w-24 rounded bg-gc-bg-3" />
          <div className="h-3 w-14 rounded bg-gc-bg-3" />
        </div>
        <div className="h-8 w-24 rounded bg-gc-bg-3" />
      </div>
    </div>
  );
}
