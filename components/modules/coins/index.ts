// components/modules/coins/index.ts
// Barrel export per i componenti coin riusabili in app.
export { CoinIcon } from "./coin-icon";
export { CoinPriceLabel } from "./coin-price-label";
export { MiniSparkline } from "./mini-sparkline";
export { CoinCard } from "./coin-card";
export { CoinCardSkeleton } from "./coin-card-skeleton";
export { CoinCardGrid, CoinCardGridSkeleton } from "./coin-card-grid";
// Importare `CoinChart` DIRETTAMENTE dal barrel trascina Recharts +
// lodash (~100KB gzip) nel bundle del caller anche se il chart è solo
// uno dei tanti componenti renderizzati. Per le pagine pubbliche usare
// invece `CoinChartLazy` (dynamic ssr:false wrapper).
export { CoinChart } from "./coin-chart";
export { CoinChartLazy } from "./coin-chart-lazy";
export { mockWatchlistCount, formatCompactCount } from "./mock-watchlist";
