import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

/**
 * Loader server-side per next-intl.
 *
 * Risolve il locale per ogni request:
 * - Se siamo in `app/[locale]/...` → next-intl passa `requestLocale` da segment param
 * - Altrimenti (zone non-prefix: auth/admin/protected):
 *     1. Se l'utente è loggato e ha `users.locale` impostato → usa quello.
 *        Importante per le server action: non passano per il layout, quindi
 *        senza questo step userebbero il guess da cookie/Accept-Language e
 *        i messaggi di errore tornerebbero in una lingua diversa dalla
 *        pagina renderizzata.
 *     2. Altrimenti leggi header `x-locale` (settato da proxy.ts da cookie
 *        / Accept-Language / DEFAULT_LOCALE).
 *
 * Carica i messaggi per namespace con fallback chain "default → richiesto":
 * - Carica il file del namespace nel DEFAULT_LOCALE come base
 * - Se locale ≠ default, carica la versione del locale richiesto e fa
 *   deep-merge sopra il base. Le chiavi mancanti nel locale richiesto
 *   cadono sulla versione default (no chiave grezza, no errore).
 *
 * Path convention:
 * - Namespace "core" (auth/admin/public/core) vivono in `messages/{locale}/`
 *   alla root del progetto: sono globali, non legati a un modulo.
 * - Namespace di modulo (posts, prices, follows, …) vivono dentro al
 *   modulo: `lib/modules/<slug>/messages/{locale}/<slug>.json`. Coerente
 *   con feedback_module_isolation — eliminare un modulo = `rm -rf` di una
 *   sola cartella, niente file orfani in root.
 *
 * Aggiungere nuovi namespace SOLO dopo aver creato i 2 file (EN + IT).
 */

const NAMESPACES = ["core", "auth", "public", "admin", "posts"] as const;
type Namespace = (typeof NAMESPACES)[number];

const LOADERS: Record<
  Locale,
  Record<Namespace, () => Promise<{ default: Record<string, unknown> }>>
> = {
  en: {
    core: () => import("@/messages/en/core.json"),
    auth: () => import("@/messages/en/auth.json"),
    public: () => import("@/messages/en/public.json"),
    admin: () => import("@/messages/en/admin.json"),
    posts: () => import("@/lib/modules/posts/messages/en/posts.json"),
  },
  it: {
    core: () => import("@/messages/it/core.json"),
    auth: () => import("@/messages/it/auth.json"),
    public: () => import("@/messages/it/public.json"),
    admin: () => import("@/messages/it/admin.json"),
    posts: () => import("@/lib/modules/posts/messages/it/posts.json"),
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseValue = base[key];
    const overlayValue = overlay[key];
    if (isPlainObject(baseValue) && isPlainObject(overlayValue)) {
      out[key] = deepMerge(baseValue, overlayValue);
    } else {
      out[key] = overlayValue;
    }
  }
  return out;
}

async function loadNamespaceMessages(
  locale: Locale,
  ns: Namespace,
): Promise<Record<string, unknown>> {
  const mod = await LOADERS[locale][ns]();
  const data = mod.default;
  return isPlainObject(data) ? data : {};
}

async function tryGetUserLocale(): Promise<Locale | null> {
  // Dynamic import: evita di trascinare il grafo db nel bundle quando
  // questo modulo viene risolto in contesti senza DB (build, test).
  try {
    const { getUser } = await import("@/lib/db/queries");
    const user = await getUser();
    return user?.locale && isLocale(user.locale) ? user.locale : null;
  } catch {
    return null;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const fromUrlSegment = await requestLocale;

  let locale: Locale = DEFAULT_LOCALE;
  if (fromUrlSegment && isLocale(fromUrlSegment)) {
    locale = fromUrlSegment;
  } else {
    // 1) Prova con la preferenza dell'utente loggato (anche per server
    //    action che non passano per il layout). getUser è cached via
    //    React cache: una sola query DB per request.
    const userLocale = await tryGetUserLocale();
    if (userLocale) {
      locale = userLocale;
    } else {
      // 2) Fallback all'header settato dal proxy
      const headerLocale = (await headers()).get("x-locale");
      if (headerLocale && isLocale(headerLocale)) {
        locale = headerLocale;
      }
    }
  }

  const messages: Record<string, Record<string, unknown>> = {};
  for (const ns of NAMESPACES) {
    const base = await loadNamespaceMessages(DEFAULT_LOCALE, ns);
    if (locale === DEFAULT_LOCALE) {
      messages[ns] = base;
    } else {
      const overlay = await loadNamespaceMessages(locale, ns);
      messages[ns] = deepMerge(base, overlay);
    }
  }

  return { locale, messages };
});
