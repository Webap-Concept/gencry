// lib/ui/avatar-fallback.ts
//
// Helpers per il fallback dell'avatar quando l'utente non ha un'immagine
// caricata. Usati da <UserAvatar> in components/ui/user-avatar.tsx.
//
// Strategia:
//   - colorForSeed(seed): hash deterministico → index in palette fissa di
//     10 colori HSL armoniosi col tema sabbia/bosco. Stesso seed →
//     sempre lo stesso colore (no flicker cross-render).
//   - initialsFromUser(user): 2 char uppercase. Priorità: firstName[0]+
//     lastName[0] → username[0..2] → email[0..2] → "?".
//
// Niente crypto hash: gli input sono stringhe corte (uuid 36 char,
// username 3-32 char) e collision-quality non è critico — la palette
// ha solo 10 colori, le collisioni avvengono al ~10% per definizione.

export type AvatarUserLike = {
  id?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

/**
 * Palette di 10 colori HSL. Hue distribuite ~36° per copertura uniforme,
 * saturation/lightness scelti per essere distintivi su entrambi i temi
 * (sabbia chiaro, bosco scuro) mantenendo il testo bianco leggibile.
 *
 * Cambiando l'ordine cambi la mappa seed→colore di TUTTI gli utenti.
 * Aggiungere/rimuovere voci → re-distribuisce tutto, l'utente cambia
 * colore. Trattare come stable contract una volta in prod.
 */
const PALETTE = [
  "hsl(  6, 70%, 50%)", // rosso corallo
  "hsl( 28, 78%, 50%)", // arancio
  "hsl( 50, 72%, 45%)", // ocra
  "hsl( 95, 38%, 42%)", // verde bosco
  "hsl(160, 50%, 40%)", // verde acqua
  "hsl(195, 60%, 45%)", // azzurro
  "hsl(220, 55%, 55%)", // blu
  "hsl(258, 45%, 55%)", // viola
  "hsl(295, 45%, 50%)", // magenta
  "hsl(335, 60%, 55%)", // rosa fuxia
] as const;

/** Hash deterministico → index palette. Sum-of-char-codes mod N. */
export function colorForSeed(seed: string | null | undefined): string {
  if (!seed) return PALETTE[0];
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum = (sum + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(sum) % PALETTE.length];
}

/**
 * 2 char uppercase per l'avatar. Tenta in ordine di priorità di
 * decrescente "specificità" — se l'utente ha first+last usali, altrimenti
 * la prima coppia di char informativi dalle altre fonti.
 *
 * Casi:
 *   - firstName "Mario", lastName "Rossi"   → "MR"
 *   - firstName "Mario", lastName null      → "MA"
 *   - username "webapp"                     → "WE"
 *   - email "mario.rossi@example.com"       → "MA"
 *   - tutto null                            → "?"
 */
export function initialsFromUser(user: AvatarUserLike): string {
  const fn = user.firstName?.trim();
  const ln = user.lastName?.trim();
  if (fn && ln) {
    return (fn[0] + ln[0]).toUpperCase();
  }
  if (fn && fn.length >= 2) {
    return fn.slice(0, 2).toUpperCase();
  }
  const un = user.username?.trim();
  if (un && un.length >= 2) {
    return un.slice(0, 2).toUpperCase();
  }
  if (un && un.length === 1) {
    return un.toUpperCase();
  }
  const em = user.email?.trim();
  if (em && em.length >= 2) {
    return em.slice(0, 2).toUpperCase();
  }
  return "?";
}

/** Seed canonico per la color lookup. Preferisce id (stabile), fallback
 *  username, fallback email. Stesso utente = sempre stesso seed. */
export function seedFromUser(user: AvatarUserLike): string {
  return user.id ?? user.username ?? user.email ?? "anon";
}
