// lib/modules/seeders/services/content-templates-it.ts
//
// Pool di contenuti in italiano per i seed.
//
// Strutturato per mood:
//   - GENERIC: template neutri, usabili da qualsiasi mood (~30 voci)
//   - TEMPLATES_BY_MOOD: sub-pool per ognuno degli 8 archetypes
//   - META_SITE: template "meta" che parlano del sito stesso (~25 voci,
//     mai negativi). Triggered indipendentemente dal mood col 10% di
//     probability.
//
// Placeholder supportati:
//   - {ticker}            → "$BTC"
//   - {ticker_name}       → "Bitcoin"
//   - {ticker_trend_7d}   → "in crescita" / "in calo" / "stabile"
//   - {ticker_trend_30d}  → idem ma su 30 giorni
//   - {mention}           → "@username"
//   - {url}               → URL esterno da pool

import type { UserMood } from "./mood-types";

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

export const POST_URL_POOL = [
  "https://www.coingecko.com/en/coins/bitcoin",
  "https://www.coingecko.com/en/coins/ethereum",
  "https://etherscan.io/",
  "https://www.coindesk.com/",
  "https://decrypt.co/",
];

// ─────────────────────────────────────────────────────────────────────
// GENERIC — template neutri usabili da tutti i mood (~30)
// ─────────────────────────────────────────────────────────────────────

export const GENERIC_TEMPLATES_IT = [
  "Buongiorno!",
  "Settimana intensa.",
  "Pazienza, sempre pazienza.",
  "Riflettendo sui prossimi mesi.",
  "Letto un articolo molto interessante stamattina.",
  "Self custody. Sempre.",
  "Not your keys, not your coins.",
  "Cosa state guardando questa settimana?",
  "Conferenza interessante in programma.",
  "Discutendo strategie con il mio team.",
  "Volume in calo nelle ultime 24h.",
  "Migliore decisione di quest'anno: smettere di guardare il prezzo ogni ora.",
  "Mai investire più di quanto puoi permetterti di perdere.",
  "Il bear market crea i veri builders.",
  "Spendo la mattina a leggere whitepaper.",
  "Onesto, sto provando a capire dove va il mercato.",
  "Comunità importante più del prezzo.",
  "Educazione prima di tutto.",
  "Cerco contenuti di qualità, ne giro tanti.",
  "Tagliato il rumore, focus sui fondamentali.",
  "Le emozioni sono il peggior nemico nel trading.",
  "Un altro lunedì, un altro candle a guardare.",
  "Buona giornata a tutti gli {ticker}-holder.",
  "Diversificare ha senso, ma fino a un certo punto.",
  "Posto qui perché su altri social è impossibile parlare seriamente.",
  "Sto facendo pulizia di portafoglio.",
  "Riguardando dati storici. Sempre istruttivo.",
  "Tempo di staking e patience.",
  "Riflessione: la psicologia conta più della tecnica.",
  "Nuovo episodio del podcast {url}, da non perdere.",
];

// ─────────────────────────────────────────────────────────────────────
// TEMPLATES_BY_MOOD — sub-pool per ogni archetipo (~25 a testa)
// ─────────────────────────────────────────────────────────────────────

const BULLISH_BTC: string[] = [
  "{ticker} è inarrestabile. {ticker_trend_30d} non mente.",
  "Bitcoin maximalist per sempre. Tutto il resto è rumore.",
  "Continuo ad accumulare {ticker}. Long-term plan.",
  "$BTC è l'unica vera crypto. Cambio mio nome.",
  "Halving in arrivo. Chi non sta accumulando ora ci pensa dopo.",
  "{ticker} non è una moneta, è una rivoluzione monetaria.",
  "21 milioni. Punto. Fine della storia.",
  "Bitcoin Standard. Lo leggete e capite tutto.",
  "Bitcoin {ticker_trend_7d} questa settimana, ma la macro è chiarissima.",
  "Adoption istituzionale di {ticker_name} cresce, retail dorme.",
  "Storia: {ticker} ha sempre fatto nuovi all-time-high. Sempre.",
  "Self-custody su hardware wallet. Punto non negoziabile.",
  "Stack sats and shut up. Strategia testata.",
  "Sentivo dire che {ticker} era morto. Eppure eccolo.",
  "Discutiamo di altre crypto solo dopo aver capito {ticker}.",
  "Per me Bitcoin è già vincente. Il resto è solo timing.",
  "Vedere {ticker} a sei cifre è solo questione di tempo.",
  "I miei figli avranno {ticker}. È un'eredità, non un investimento.",
  "Ogni dip in {ticker} è un'opportunità di accumulo.",
  "Trasferito altri sats sul cold storage. Routine settimanale.",
  "{ticker_name} è il miglior asset del decennio. Numeri alla mano.",
  "Mining network sicuro come mai. Health di Bitcoin top.",
  "Detrattori sempre sbagliati. Bitcoin sempre lì.",
  "Niente è più hard money di {ticker}.",
  "Forse non lo capirai oggi. Forse domani. Ma {ticker} ti aspetta.",
];

const BEARISH: string[] = [
  "{ticker} {ticker_trend_7d}, ve lo dicevo da settimane.",
  "Mercato troppo verde, aspetto il pullback.",
  "Pazienza. Il prossimo crash è solo questione di tempo.",
  "Non sto comprando niente fino a quando non vedo capitulation.",
  "{ticker} ha rotto il supporto. Niente di buono in vista.",
  "Volume in calo, sentiment troppo positivo. Red flag.",
  "Indicatori macro tutti negativi. Crypto soffrirà.",
  "Bear market non è finito. Ci risentiamo a -40%.",
  "Quando tutti sono bullish è il momento di essere prudenti.",
  "Diversificate, ma soprattutto tenete cash.",
  "I FOMO buyers di ora saranno i bag holder di domani.",
  "{ticker} potrebbe scendere ancora del 30% senza problemi.",
  "Ricordiamoci che il 2022 è successo per dei motivi precisi.",
  "Distribuzione delle whale è chiara. Stanno scaricando.",
  "Niente FOMO. Aspetto i miei target di entry.",
  "Liquidity globale sta scendendo. Crypto storicamente segue.",
  "Storicamente {ticker} a questi livelli ha sempre corretto.",
  "Setup tecnico {ticker} fa pena. Pattern bearish chiaro.",
  "Macro headwinds in arrivo. Tenetevi pronti.",
  "Risk-off mode attivato. Cash è la mia migliore posizione.",
  "Bitcoin {ticker_trend_30d} ma il sentimento è ipoteticamente positivo. Strano.",
  "Quando la nonna parla di crypto, è il momento di uscire.",
  "Profittevoli? Forse. Sostenibili? Lo vedremo.",
  "Vorrei essere bullish ma i numeri non mentono.",
  "Liquidazioni in arrivo se {ticker} rompe i $X. Stop loss pronti.",
];

const HODLER: string[] = [
  "DCA settimanale fatto. Routine sacra.",
  "HODL is the way. Niente di nuovo qui.",
  "{ticker} {ticker_trend_30d}? Non guardo il chart, guardo il calendario.",
  "Time in the market beats timing the market.",
  "Compro ogni venerdì da 3 anni. Non sbaglio una mossa.",
  "Pazienza è la mia super-power.",
  "Volatilità è features, non bug.",
  "I miei {ticker} non si toccano. Ever.",
  "Hardware wallet, seed phrase memorizzata, sleep peacefully.",
  "Bear market = saldi. Bull market = staking.",
  "Non guardo Twitter da 6 mesi. Strategia migliore mai presa.",
  "Long term thesis intatta su {ticker_name}.",
  "Compound interest > picking tops.",
  "I trader si stancano. Gli hodler dormono bene.",
  "Discipline > intelligence in questo mercato.",
  "Conservare sats è più importante che farne di più.",
  "5 anni minimum horizon. Tutto il resto è rumore.",
  "Cold storage e via. Niente custodial, niente exchange.",
  "Storia ci insegna: chi tiene vince.",
  "Volatilità di breve non mi tocca.",
  "Strategy: DCA, HODL, repeat.",
  "Le mani forti sono fatte cosi: le mie.",
  "Vendere ora sarebbe ridicolo. Tesi inalterata.",
  "Time horizon 10 anni, niente paura.",
  "Pagati e accumulati. Settimana fatta.",
];

const TRADER: string[] = [
  "Long {ticker} con stop sotto i minimi della settimana.",
  "{ticker} ha rotto la resistenza. Targeting il prossimo livello.",
  "Volume in aumento su {ticker}, breakout valido.",
  "RSI ipervenduto su {ticker}, possibile bounce.",
  "Setup interessante su {ticker_name}, mean reversion in arrivo.",
  "Fibonacci 0.618 di {ticker} tiene. Long con stop tight.",
  "Divergenza bearish su {ticker} 4h. Cautela.",
  "{ticker} candela giornaliera importante. Continuation o reversal?",
  "Chiuso il trade su {ticker} in profitto. Risk management ripaga.",
  "Daily close è tutto. {ticker} sopra resistance = bull.",
  "Liquidità sopra. {ticker} probabilmente la testa.",
  "Order block 4h tiene su {ticker}. Long secondario.",
  "Volume profile chiaro su {ticker}. POC zona di interesse.",
  "Trade idea: short {ticker} se rompe supporto. Stop tight.",
  "Equity curve in growth. Disciplina paga sempre.",
  "Backtest del setup confermato. Live ora.",
  "{ticker} pattern testa-spalle confermato. Target a 1:3 R:R.",
  "Macro economic events questa settimana. Cautela operativa.",
  "Funding rate {ticker} alto. Long crowded, attenzione.",
  "Open interest in salita. {ticker} prepara un movimento grosso.",
  "{ticker_trend_7d} sui charts, sentiment in linea. Coerente.",
  "Lavoro sulle 4h, vivo sulle daily.",
  "Mai più di 1% di rischio per trade. Discipline saves accounts.",
  "Setup tecnico chiaro su {ticker_name}. Eseguo senza emozioni.",
  "Bot di alert mi ha svegliato per {ticker}. Eseguito.",
];

const DEFI: string[] = [
  "Yield farming su Arbitrum sta dando ottimi APY questa settimana.",
  "Nuovo protocollo DeFi su {ticker_name}, audit pulito.",
  "Liquid staking è il prodotto cripto più sottovalutato del 2025.",
  "Layer 2 stanno cannibalizzando la mainnet. Inevitabile.",
  "TVL in salita su {ticker_name}. Adoption reale.",
  "Restaking è interessante ma anche complesso. Faccio attenzione.",
  "Pool {ticker_name}/USDC mi sta dando rendimenti ottimi.",
  "Composability è il vero superpower di DeFi.",
  "Cross-chain bridge sicuri? Storia dice di no. Audit + trust minimi.",
  "Tassi DeFi vs TradFi: gap interessante in alcuni casi.",
  "Vault automatizzati > yield farming manuale. Lazy economy.",
  "Smart contract risk è il vero rischio non-prezzato in DeFi.",
  "Liquidity mining è morto. Vere yields da fee reali.",
  "Audit firms ne fanno troppi, qualità in calo. Da verificare sempre.",
  "MEV è ancora un problema serio. Protocolli che lo mitigano vincono.",
  "DEX volume cresce mese su mese. CEX in declino structural.",
  "Lending markets {ticker_trend_30d}, opportunità o trap?",
  "Real World Assets on-chain è il prossimo big trend.",
  "Stablecoin yields rimangono solidi. DeFi-native è il futuro.",
  "Permissionless è l'unica vera innovazione.",
  "Self-sovereign finance, mai più dipendere da banche.",
  "DAOs governance: idea bella, esecuzione spesso pessima.",
  "Tokenomics di {ticker_name} ha senso? Discutiamone.",
  "Account abstraction cambierà il game in DeFi.",
  "Capital efficiency in DeFi è migliorata 10x in 2 anni.",
];

const MACRO: string[] = [
  "Tassi Fed alti = crypto soffre. Pattern storico.",
  "Liquidity globale è il driver principale del mercato.",
  "M2 in espansione = bull crypto. Sempre stato così.",
  "DXY in salita = pressure su {ticker}. Aspetto.",
  "Geopolitica influenza crypto più di quanto si pensi.",
  "CPI report questa settimana. Cautela operativa.",
  "Tassi reali ancora positivi. Asset risk-on faticano.",
  "Banca centrale cinese silenziosa. Sospetto.",
  "QT continua. Liquidity tighter, crypto soffre.",
  "Quando Fed pivota, {ticker_name} parte. Solo questione di tempo.",
  "Macroeconomic backdrop è tutto. Tecnica è rumore.",
  "Recessione americana? Crypto storicamente non ama recessioni.",
  "Yield curve invertita da troppo. Qualcosa si rompe presto.",
  "Sentiment macro è troppo positivo. Tipica top dei mercati.",
  "ETF crypto institucional flow. Da monitorare.",
  "USD strength è il vero killer del mercato crypto adesso.",
  "BoJ pivot potrebbe scatenare carry trade unwind. Watch out.",
  "Liquidità trimestre Q4 storicamente positiva per risk assets.",
  "Petrodollar dynamics influenzano crypto adoption Middle East.",
  "Stablecoin market cap = liquidity proxy per crypto.",
  "Real yields ancora elevati. {ticker_name} {ticker_trend_30d} coerente.",
  "Treasury issuance schedule è il dato chiave da seguire.",
  "Crypto è ancora correlato a NDX. Decoupling? Vediamo.",
  "Inflazione tornerà. Hedge crypto sarà chiaro.",
  "Fiscal dominance è il vero rischio. Crypto beneficia long term.",
];

const NEWBIE: string[] = [
  "Primo post qui. Come funziona?",
  "Mi spiegate cosa significa HODL?",
  "Sto imparando da zero. Consigli su dove iniziare?",
  "Comprato i miei primi {ticker} oggi. Emozionato e nervoso.",
  "Domanda stupida: la differenza tra wallet e exchange?",
  "Confuso da tutti questi nomi. {ticker_name} è una crypto?",
  "Cosa intendete per cold storage?",
  "Conviene tenere su exchange o su wallet?",
  "Quanto rischio se compro $100 di {ticker}?",
  "Sto leggendo molto ma è ancora confuso.",
  "Esiste un libro per iniziare?",
  "Differenza tra Bitcoin ed Ethereum in parole semplici?",
  "Ho paura di sbagliare e perdere tutto.",
  "I miei amici dicono che è una truffa. È vero?",
  "Quanto tempo serve per capire questo mondo?",
  "Sto guardando dei video su YouTube. Consigli di canali?",
  "Come faccio a sapere se un progetto è serio?",
  "Le tasse su crypto in Italia come funzionano?",
  "Apre questo wallet ma non capisco le chiavi private.",
  "Voglio capire prima di mettere soldi seri.",
  "{ticker} mi sembra interessante. Da dove inizio per studiarlo?",
  "Per voi che siete dentro da anni, cosa rifareste?",
  "Domanda: il prezzo si vede dove?",
  "Cosa mi consigliate di studiare per primo?",
  "Vi prego non giudicate, sto solo imparando.",
];

const DEGEN: string[] = [
  "{ticker} WAGMI 🚀",
  "Memecoin season alle porte, lo sento.",
  "All-in su {ticker_name}. YOLO life.",
  "Mooning 🌕 chi è entrato prima sa.",
  "{ticker} 100x non è una domanda, è quando.",
  "Ape mode activated. Niente analisi, solo vibes.",
  "{ticker} rugged? Non per me, sono dentro fino al collo.",
  "Bag holders unite. {ticker} sale o muore.",
  "Sto compranduon altro {ticker}. Diamond hands forever.",
  "DYOR? Ho fatto research per 30 secondi su Twitter, basta così.",
  "Fortuna è fatta. {ticker_name} è la prossima Solana.",
  "Liquidato 3 volte questo mese. Pumpa lo stesso, no stress.",
  "FOMO è la mia strategia. Disciplinata? No. Funziona? A volte.",
  "Holding {ticker} like my life depends on it (forse è cosi).",
  "Ape now, regret later. Sempre.",
  "Quando vedo green candle metto stop loss in alto.",
  "Stupid is the new smart in crypto.",
  "{ticker_trend_7d}? Stop chiedere, continua a comprare.",
  "Memecoin che fa +50% in un'ora = quella giusta? Forse.",
  "Sto creando una mia memecoin. Chi entra?",
  "Conviction over conviction. Holding fino allo zero.",
  "{ticker} è il nuovo standard di degenness.",
  "Liquidazioni a chi? Sto comprando di nuovo.",
  "Niente paura, niente glory.",
  "Memecoins sono la mia retirement plan. Don't @ me.",
];

export const TEMPLATES_BY_MOOD: Record<UserMood, string[]> = {
  bullish_btc: BULLISH_BTC,
  bearish: BEARISH,
  hodler: HODLER,
  trader: TRADER,
  defi: DEFI,
  macro: MACRO,
  newbie: NEWBIE,
  degen: DEGEN,
};

// ─────────────────────────────────────────────────────────────────────
// META_SITE — commenti meta sul sito stesso (~25, mai negativi)
// Triggered con 10% probabilità INDIPENDENTEMENTE dal mood. Override.
// ─────────────────────────────────────────────────────────────────────

export const META_SITE_TEMPLATES_IT = [
  // Positivi entusiasti (60%)
  "Bella scoperta questo sito, mi sa che ci passerò un po' di tempo.",
  "Finalmente un posto serio per parlare di crypto.",
  "Pulizia dell'interfaccia incredibile.",
  "Capolavoro la pagina coin con tutti i dati.",
  "Mi piace molto come è pensato il social, niente rumore.",
  "Bell'approccio, sembra fatto da gente che capisce.",
  "Già pochi giorni qui e mi trovo bene.",
  "Trovo bello il design pulito, niente distrazioni.",
  "Sentiment dei coin direttamente nel feed: ottima feature.",
  "Sostituirà Twitter per la crypto-discussione, lo sento.",
  "Bel mix di seriousness e leggerezza, buon clima.",
  "Tutti i dati che mi servono in un posto solo.",
  "Lavoro pulito, sembra studiato bene.",
  "Esperienza utente fluida, finalmente.",
  "Posso vedere il prezzo accanto al post, geniale.",

  // Neutri curiosi (40%)
  "Primo post qui. Saluti a tutti.",
  "Sto provando a capire come funziona la community.",
  "Curioso di scoprire chi sono i top user.",
  "Iniziando a leggere i vostri post, qualità interessante.",
  "Vedo molti italiani qui, è una novità.",
  "Provo a postare qualcosa per testare.",
  "Riflettendo sull'approccio del prodotto.",
  "Sembra esserci spazio per discussioni serie. Vediamo.",
  "Tools interessanti, da esplorare con calma.",
  "Vediamo se questo posto diventa il mio nuovo daily check.",
];
