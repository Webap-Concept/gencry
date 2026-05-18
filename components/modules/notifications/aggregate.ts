// components/modules/notifications/aggregate.ts
//
// Aggregazione client-side delle notifiche: stesso `type` + stesso
// `postId` + stesso giorno (UTC YYYY-MM-DD) → 1 gruppo invece di N
// righe separate. Pattern Twitter/Threads.
//
// Window key: ISO date UTC. Edge case: notifiche a cavallo della
// mezzanotte UTC cadono in giorni diversi → restano separate. Accettabile
// (rare, e l'utente capisce comunque dal context). Per timezone locale
// servirebbe `Intl.DateTimeFormat` per timezone — complica per +0 valore.
//
// Ordering preservato: il representative del gruppo è il primo nella
// lista source (più recente, perché la query ritorna DESC). Il gruppo
// si posiziona nella timeline dove sta il rappresentante.
import type { NotificationListItem } from "@/lib/modules/notifications/queries";

export type NotificationGroup =
  | { kind: "single"; item: NotificationListItem }
  | {
      kind: "group";
      /** Tutti gli items del gruppo (>= 2). Primo = più recente. */
      items: NotificationListItem[];
      /** Comodità: items[0]. Usato per posizione + target href + read state. */
      representative: NotificationListItem;
    };

/** Tipi che ha senso aggregare. I `mention` e `repost` sono "unique by
 *  actor on a post" e raramente arrivano in burst — meglio singoli per
 *  preservare il preview specifico di ognuno. */
const AGGREGATABLE_TYPES = new Set([
  "post.reaction.added",
  "post.comment.created",
  "post.comment.reaction.added",
]);

function dayKey(date: Date): string {
  // YYYY-MM-DD in UTC. Format stabile per Map key.
  return new Date(date).toISOString().slice(0, 10);
}

function groupKey(item: NotificationListItem): string | null {
  if (!AGGREGATABLE_TYPES.has(item.type)) return null;
  if (!item.postId) return null;
  return `${item.type}::${item.postId}::${dayKey(item.createdAt)}`;
}

/**
 * Riceve notifiche ordinate per createdAt DESC e ritorna gruppi
 * preservando l'ordine: ogni gruppo prende la posizione del proprio
 * representative (primo arrivato nella scan).
 */
export function aggregateNotifications(
  items: NotificationListItem[],
): NotificationGroup[] {
  const groupsByKey = new Map<string, NotificationListItem[]>();
  const output: NotificationGroup[] = [];

  for (const item of items) {
    const key = groupKey(item);
    if (!key) {
      output.push({ kind: "single", item });
      continue;
    }
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.push(item);
      continue;
    }
    // Prima occorrenza: registra il gruppo + placeholder nell'output.
    // Lo finalizziamo in pass 2 (sotto) dopo aver visto tutti i membri.
    const arr: NotificationListItem[] = [item];
    groupsByKey.set(key, arr);
    output.push({ kind: "group", items: arr, representative: item });
  }

  // Pass 2: i gruppi rimasti con 1 solo item li convertiamo a 'single'
  // (visualmente identico, evita render del wrapper inutile).
  return output.map((g) => {
    if (g.kind === "single") return g;
    if (g.items.length === 1) return { kind: "single", item: g.items[0] };
    return g;
  });
}
