// components/modules/watchlist/featured-watchlist-bar.tsx
//
// RSC wrapper della barra "watchlist nel feed". Carica la featured
// watchlist dell'utente (getFeaturedWatchlistForFeed, React.cache) e la
// passa al client component per il toggle espandi/comprimi.
//
// Ritorna null se: utente anonimo, nessuna watchlist featured, o featured
// vuota → la barra semplicemente non appare (decisione product). È montata
// in `home.hero` (renderizzato inline senza Suspense), quindi il null non
// lascia spazio né flash di skeleton.
import { getUser } from "@/lib/db/queries";
import { getFeaturedWatchlistForFeed } from "@/lib/modules/watchlist/queries";
import {
  FeaturedWatchlistBarClient,
  type FeaturedChip,
} from "./featured-watchlist-bar-client";

export async function FeaturedWatchlistBar() {
  const user = await getUser();
  if (!user) return null;

  const data = await getFeaturedWatchlistForFeed(user.id);
  if (!data) return null;

  // Payload minimo verso il client: solo i campi che la chip usa (no
  // name/imageUrl/category della CoinView, che peserebbero inutilmente).
  const coins: FeaturedChip[] = data.coins.map((c) => ({
    symbol: c.symbol,
    price: c.price,
    change24h: c.change24h,
    sparkline: c.weeklySparkline ?? [],
  }));

  return (
    <FeaturedWatchlistBarClient
      watchlistId={data.id}
      name={data.name}
      coins={coins}
    />
  );
}

// Obbligatorio per il contratto HomeSection. La barra vive in `home.hero`
// (render inline, senza Suspense) quindi questo skeleton non viene mai
// mostrato in pratica — esiste per coerenza col tipo e se un giorno la
// sezione venisse spostata in uno slot con Suspense.
export function FeaturedWatchlistBarSkeleton() {
  return (
    <div
      className="gc-dark rounded-2xl bg-gc-bg-2 border border-gc-line p-4 animate-pulse"
      aria-hidden
    >
      <div className="h-5 w-32 rounded bg-gc-bg-3 mb-3" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-40 rounded-full bg-gc-bg-3" />
        ))}
      </div>
    </div>
  );
}
