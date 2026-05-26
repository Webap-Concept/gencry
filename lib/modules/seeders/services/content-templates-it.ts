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
