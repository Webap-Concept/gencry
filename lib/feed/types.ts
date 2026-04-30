// Tipi specifici del feed sociale.
// FeedItem è una discriminated union su `type` per coprire le tre varianti
// di card mostrate nel feed; ogni variante ha campi propri ma condivide
// metadati comuni (autore, timestamp, contatori interazione).

type FeedItemBase = {
  id: string;
  /** handle dell'autore (riferimento a User.handle) */
  user: string;
  /** Stringa relativa pronta per il render, es. "8m", "23m", "2h" */
  time: string;
  note?: string;
  likes: number;
  comments: number;
  liked?: boolean;
};

export type AddCoinItem = FeedItemBase & {
  type: "add_coin";
  /** ticker della coin aggiunta (riferimento a Coin.sym) */
  coin: string;
  /** Nome della watchlist destinazione */
  watchlist: string;
};

export type PriceAlertItem = FeedItemBase & {
  type: "price_alert";
  coin: string;
  direction: "up" | "down";
  target: number;
};

export type NewWatchlistItem = FeedItemBase & {
  type: "new_watchlist";
  watchlist: string;
  /** ticker delle coin contenute */
  coins: string[];
};

export type FeedItem = AddCoinItem | PriceAlertItem | NewWatchlistItem;
