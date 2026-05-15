// lib/modules/seeders/services/content-templates-it.ts
//
// Pool di contenuti in italiano per i seed: nomi, cognomi, bio, body
// dei post. Tutto plain text — il parser ticker + mention del modulo
// posts si occupa di trasformare $BTC / @username in link.
//
// Body templates: stringhe con placeholder `{ticker}` e `{mention}` che
// vengono sostituite a runtime con valori random dai pool disponibili
// (coin symbol da prices, username da altri seed users). I template
// "neutri" (senza placeholder) restano testo puro.

export const FIRST_NAMES_IT = [
  "Marco", "Giulia", "Luca", "Sara", "Alessandro", "Francesca", "Matteo",
  "Chiara", "Davide", "Elisa", "Federico", "Martina", "Riccardo", "Alessia",
  "Andrea", "Valentina", "Stefano", "Laura", "Simone", "Giorgia", "Tommaso",
  "Camilla", "Lorenzo", "Aurora", "Filippo", "Beatrice", "Edoardo", "Sofia",
  "Gabriele", "Anna", "Giovanni", "Eleonora", "Diego", "Noemi", "Manuel",
];

export const LAST_NAMES_IT = [
  "Rossi", "Bianchi", "Russo", "Ferrari", "Esposito", "Romano", "Colombo",
  "Bruno", "Ricci", "Marino", "Greco", "Bianco", "Conti", "Costa", "Gallo",
  "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro",
  "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martinelli",
];

export const USERNAME_SUFFIXES = [
  "_crypto", "_btc", "_eth", "_hodl", "_42", "_88", "_trader", "_to_the_moon",
  "_defi", "_nft", "_chain", "_node", "", "", "", "", // alcuni senza suffix
];

export const BIO_TEMPLATES_IT = [
  "Crypto enthusiast dal 2017.",
  "HODL is the way.",
  "DCA every week.",
  "Sempre alla ricerca della prossima 100x.",
  "DeFi, NFT, Layer 2.",
  "Long term thinker.",
  "Bitcoin maximalist (più o meno).",
  "Ex skeptic, ora full-time degen.",
  "Tutti i miei pensieri sono finanziari (non finanziari).",
  "On-chain dal 2019. Bear market survivor.",
  "Trading è 80% psicologia.",
  "",
  "",
  "",
];

export const INTERESTS_POOL = [
  "bitcoin", "ethereum", "defi", "nft", "layer-2", "staking", "trading",
  "altcoin", "memecoin", "solana", "polygon", "arbitrum", "yield-farming",
  "on-chain-analysis", "macro", "technical-analysis",
];

/**
 * Body templates. Placeholder supportati:
 *   - {ticker}      → "$BTC" (o altro symbol attivo, picked random)
 *   - {ticker_name} → "Bitcoin" (nome esteso, picked random)
 *   - {mention}     → "@username" di altro seed user
 *   - {url}         → URL fittizio (es. coingecko link)
 *
 * Un template può avere 0..N placeholder. La distribuzione di template
 * con/senza placeholder è gestita dal seeder (~30% con ticker, ~10%
 * con mention, ~10% con ticker_name esteso).
 */
export const POST_BODY_TEMPLATES_IT = [
  // Solo testo (no placeholder)
  "Buongiorno!",
  "Il mercato oggi è interessante.",
  "Settimana intensa.",
  "Sentiment generale: cauto.",
  "Mai investire più di quanto puoi permetterti di perdere.",
  "Pazienza, sempre pazienza.",
  "Il bear market crea i veri builders.",
  "Riflettendo sui prossimi mesi.",
  "Strategia: DCA e dimenticarsene.",
  "Letto un articolo molto interessante stamattina.",
  "Il futuro è on-chain.",
  "Self custody. Sempre.",
  "Not your keys, not your coins.",
  "Spending the day reading whitepapers.",
  "Macro update: i tassi restano alti.",
  "Cosa state guardando questa settimana?",
  "Migliore decisione del 2025: smettere di guardare il prezzo ogni ora.",
  "Volume in calo nelle ultime 24h.",
  "Conferenza interessante in programma.",
  "Discutendo strategie con il mio team.",

  // Con $TICKER esplicito (~30%)
  "{ticker} oggi è inarrestabile.",
  "Sto accumulando {ticker} a questi livelli.",
  "Target tecnico su {ticker}? Discutiamone.",
  "{ticker} ha rotto la resistenza importante.",
  "Aprite gli occhi su {ticker}.",
  "{ticker} mi sembra il più sottovalutato del momento.",
  "Comprare {ticker} ora o aspettare un pullback?",
  "Long su {ticker} con stop sotto i minimi.",
  "Volume in aumento su {ticker}, segnale interessante.",
  "Chi crede ancora in {ticker} dopo tutto questo?",
  "Devo dire che {ticker} sta sorprendendo tutti.",
  "Forza forza {ticker}.",
  "{ticker} a fine anno secondo voi dove sarà?",

  // Con nome esteso ({ticker_name} → es. "Bitcoin", "Solana")
  "{ticker_name} sta cambiando le regole del gioco.",
  "Tutti parlano di {ticker_name}, ma pochi capiscono cosa c'è dietro.",
  "Adoption di {ticker_name} cresce mese dopo mese.",
  "Ho letto la roadmap di {ticker_name}, niente male.",
  "{ticker_name} ha senso solo per il lungo periodo.",
  "Stiamo entrando in una nuova fase per {ticker_name}.",

  // Con mention
  "Concordo al 100% con {mention}, ottima analisi.",
  "Sono d'accordo con {mention}, però aggiungo un dettaglio.",
  "{mention} ha ragione, situazione complessa.",
  "Buona idea {mention}, ci provo.",

  // Combo ticker + mention
  "{mention} cosa ne pensi di {ticker} questa settimana?",
  "Grazie {mention}, ottima call su {ticker}.",
];

/**
 * Pool di URL "neutri" per il 5% dei post che includono link esterni.
 * Coingecko/etherscan/twitter sono safe (no tracker malevoli).
 */
export const POST_URL_POOL = [
  "https://www.coingecko.com/en/coins/bitcoin",
  "https://www.coingecko.com/en/coins/ethereum",
  "https://etherscan.io/",
  "https://www.coindesk.com/",
  "https://decrypt.co/",
];
