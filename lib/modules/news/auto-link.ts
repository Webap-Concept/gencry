// lib/modules/news/auto-link.ts
//
// Auto-link della prima occorrenza del nome di un coin noto (Bitcoin,
// Ethereum, …) verso /coins/<symbol>. Applicato al markdown PRIMA della
// conversione in HTML (più safe del parsing HTML con regex), così il
// link è già presente sia nel `pages.content` HTML salvato che nell'editor
// CMS post-publish.
//
// Decisioni di design (vedi conversazione 2026-05-19):
//   - Solo `name` del coin viene matchato (Bitcoin, Ethereum, Solana).
//     Symbol (BTC, ETH, $BTC) NON in V1 — troppi false positive ("ATOM"
//     è parola inglese, "SOL" può essere "soluzione" in italiano).
//   - Match case-insensitive, ma preserva la capitalization della
//     parola sorgente.
//   - **Cap 1 link per articolo**: linkare 10 volte "Bitcoin" è spam,
//     Google lo riconosce e penalizza il pattern. L'admin sceglie quale
//     articolo merita il link via checkbox.
//   - Skip dentro markdown link esistenti `[text](url)` e dentro heading
//     che iniziano con `#`.
//   - Il `title="<nome canonico>"` aiuta l'accessibilita' (tooltip on
//     hover) e contiene il nome ufficiale del coin anche quando il match
//     nel testo era lowercase o variante (es. "bitcoin" matchato → title
//     "Bitcoin"). Niente marker "auto-linked": il commento storico
//     "useful per analytics future" era ipotetico, mai consumato.

import "server-only";

export interface AutoLinkCoin {
  /** Nome leggibile usato come trigger (es. "Bitcoin"). Match case-insensitive. */
  name: string;
  /** Symbol lowercase usato nello slug URL (es. "btc" → /coins/btc). */
  symbol: string;
}

/**
 * Scansiona un testo markdown e sostituisce la PRIMA occorrenza di un nome
 * di coin in formato word-boundary `\b<name>\b`, ignorando match dentro
 * heading (`## ...`) e dentro markdown link esistenti `[...](...)`.
 *
 * Cap globale: max 1 sostituzione per chiamata (anche se ci sono N coin
 * citati nell'articolo, solo il primo che troviamo nello scan viene
 * linkato).
 *
 * Ritorna { md, linked } con il nuovo markdown e il coin effettivamente
 * linkato (utile per logging/analytics) — null se nessun match.
 */
export function autoLinkCoinsInMarkdown(
  md: string,
  coins: AutoLinkCoin[],
): { md: string; linked: AutoLinkCoin | null } {
  if (!md || coins.length === 0) return { md, linked: null };

  // Build lookup: lowercase name → coin. Filtra nomi troppo corti (<3 char)
  // per evitare match casuali (es. "ai" che è anche acronimo).
  const lookup = new Map<string, AutoLinkCoin>();
  for (const c of coins) {
    const n = c.name.trim();
    if (n.length >= 3) {
      lookup.set(n.toLowerCase(), { name: n, symbol: c.symbol.toLowerCase() });
    }
  }
  if (lookup.size === 0) return { md, linked: null };

  // Costruisco una regex unica con tutti i nomi (escape) per fare un
  // singolo scan invece di N scan separati. Ordina per length desc così
  // "Bitcoin Cash" matcha prima di "Bitcoin".
  const names = Array.from(lookup.keys()).sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const globalRe = new RegExp(`\\b(${escaped.join("|")})\\b`, "i");

  // Scanniamo riga per riga: saltiamo heading + righe che sembrano contenere
  // markdown link (rapido check). Per le righe candidate, applichiamo la
  // regex e ci fermiamo al primo match.
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip heading markdown
    if (/^\s{0,3}#{1,6}\s/.test(line)) continue;

    const match = globalRe.exec(line);
    if (!match) continue;
    const matched = match[1];
    const coin = lookup.get(matched.toLowerCase());
    if (!coin) continue;

    // Verifica che il match NON sia dentro un markdown link esistente
    // `[text](url)`: scansione veloce della linea, se il match index
    // cade dentro `[...](...)` skippiamo.
    if (isInsideMarkdownLink(line, match.index)) continue;

    const start = match.index;
    const end = start + matched.length;
    // Title = nome canonico del coin (es. "Bitcoin", "Solana"). Escape
    // delle " interne nel caso patologico di nomi con doppi apici.
    const titleSafe = coin.name.replace(/"/g, "\\\"");
    const replacement = `[${matched}](/coins/${coin.symbol} "${titleSafe}")`;
    lines[i] = line.slice(0, start) + replacement + line.slice(end);

    return { md: lines.join("\n"), linked: coin };
  }

  return { md, linked: null };
}

/**
 * Heuristic: ritorna true se il position `idx` cade dentro una sequenza
 * markdown link `[text](url)` (sia nella parte text sia nell'url). Non
 * perfetto su markdown patologico (link annidati, escape strani) ma
 * sufficiente per i casi realistici.
 */
function isInsideMarkdownLink(line: string, idx: number): boolean {
  // Trova tutte le coppie [...](...) sulla linea e verifica overlap.
  const re = /\[[^\]]*\]\([^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const s = m.index;
    const e = s + m[0].length;
    if (idx >= s && idx < e) return true;
  }
  return false;
}
