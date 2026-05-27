// lib/modules/seeders/services/content-templates-it.ts
//
// Pool di dati IT usati da user-seeder per popolare i profili utente
// (nome/cognome/username/bio/interests). Il body dei post NON arriva
// piu' da template (refactor 2026-05-26): e' generato da Claude via
// llm-content-generator. Vedi project_module_seeders_realistic.md.

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

// Suffix per username. Mix molto variegato per evitare pattern ricorrenti
// visivamente fastidiosi. ~55 entries → ogni suffix ha probabilita' <2%,
// distribuzione percepita come "naturale".
//
// USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/  (accetta lettere, numeri, `_`, `.`)
//
// CAVEAT NOTO: il MENTION_REGEX del modulo posts e'
//   /@([A-Za-z][A-Za-z0-9_]{2,29})\b/
// NON accetta `.`, quindi `@marco.99` viene catturato come `marco` e il
// fanout @mention non trova lo username completo. Da sistemare a livello
// modulo posts (aggiornare il regex per accettare `.`), fuori scope qui.
//
// Pattern usati:
//   - on-theme crypto: termini del settore
//   - trader/quant: ruolo operativo
//   - year early adopter: _2017, _2018, _2021 (chi e' "nella crypto da")
//   - numeri 2-cifre underscore: `_99` realistici "anno di nascita"
//   - numeri diretti: `marco88` stile Twitter
//   - dot-style: `marco.99`, `marco.crypto`, `marco.eth` stile ENS / handle
//   - 5 stringhe vuote → ~9% di username senza suffix
export const USERNAME_SUFFIXES = [
  // Crypto on-theme (16)
  "_crypto", "_btc", "_eth", "_hodl", "_sats", "_dao", "_lp", "_defi",
  "_nft", "_staking", "_yield", "_whale", "_maxi", "_alpha", "_wagmi", "_onchain",
  // Operativo / trader (5)
  "_trader", "_trades", "_signals", "_quant", "_to_the_moon",
  // Year early adopter (4)
  "_2017", "_2018", "_2019", "_2021",
  // Numeri underscore-style (5)
  "_07", "_22", "_69", "_77", "_99",
  // Numeri diretti (Twitter-style) — niente underscore (5)
  "88", "91", "99", "07", "22",
  // Dot-style (ENS / handle) (10)
  ".eth", ".btc", ".crypto", ".dao", ".lp",
  ".99", ".07", ".22", ".77", ".2017",
  // Senza suffix (5)
  "", "", "", "", "",
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
  "On-chain dal 2019. Bear market survivor.",
  "Trading è 80% psicologia.",
  "Web3 builder.",
  "Macro-driven investor.",
  "Curioso di tutto ciò che è on-chain.",
  "",
  "",
  "",
];

export const INTERESTS_POOL = [
  "bitcoin", "ethereum", "defi", "nft", "layer-2", "staking", "trading",
  "altcoin", "memecoin", "solana", "polygon", "arbitrum", "yield-farming",
  "on-chain-analysis", "macro", "technical-analysis",
];
