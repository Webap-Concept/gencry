// Tipi di dominio condivisi tra tutte le feature dell'area loggata.
// Coin e User sono entità globali (compaiono in feed, esplora, profilo, watchlist…).

export type Coin = {
  /** Ticker, es. "BTC", "PEPE" */
  sym: string;
  name: string;
  /** Categoria libera, es. "Layer 1", "Memecoin", "DeFi" */
  cat: string;
  price: number;
  /** Variazione % 24h. Negativa = ribasso. */
  change: number;
};

export type User = {
  handle: string;
  name: string;
  /** Iniziali mostrate nell'Avatar quando manca l'immagine */
  avatar: string;
  /** Colore di sfondo dell'Avatar (hex o rgb) */
  color: string;
  followers: number;
  bio: string;
};

export type Company = {
  handle: string;
  name: string;
  avatar: string;
  color: string;
  /** Aziende verificate ottengono il check accanto al nome */
  verified: boolean;
};
