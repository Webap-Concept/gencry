import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

/**
 * Loader server-side per next-intl.
 *
 * Risolve il locale per ogni request:
 * - Se siamo in `app/[locale]/...` → next-intl passa `requestLocale` da segment param
 * - Altrimenti (zone non-prefix: auth/admin/protected) → leggi header `x-locale`
 *   settato dal proxy.ts. Se mancante o invalido, fallback a DEFAULT_LOCALE.
 *
 * Carica i messaggi per namespace con fallback chain "default → richiesto":
 * - Carica `messages/<DEFAULT_LOCALE>/<ns>.json` come base
 * - Se locale ≠ default, carica `messages/<locale>/<ns>.json` e fa deep-merge
 *   sopra il base. Le chiavi mancanti nel locale richiesto cadono sulla
 *   versione default (no chiave grezza, no errore).
 *
 * I namespace registrati qui sono caricati per ogni request (split costo I/O
 * via dynamic import, cache su filesystem). Aggiungere nuovi namespace solo
 * dopo aver creato i file `messages/{en,it}/<ns>.json`.
 */

const NAMESPACES = ["core", "auth", "public"] as const;
type Namespace = (typeof NAMESPACES)[number];

const LOADERS: Record<
  Locale,
  Record<Namespace, () => Promise<{ default: Record<string, unknown> }>>
> = {
  en: {
    core: () => import("@/messages/en/core.json"),
    auth: () => import("@/messages/en/auth.json"),
    public: () => import("@/messages/en/public.json"),
  },
  it: {
    core: () => import("@/messages/it/core.json"),
    auth: () => import("@/messages/it/auth.json"),
    public: () => import("@/messages/it/public.json"),
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

export default getRequestConfig(async ({ requestLocale }) => {
  const fromUrlSegment = await requestLocale;

  let locale: Locale = DEFAULT_LOCALE;
  if (fromUrlSegment && isLocale(fromUrlSegment)) {
    locale = fromUrlSegment;
  } else {
    const headerLocale = (await headers()).get("x-locale");
    if (headerLocale && isLocale(headerLocale)) {
      locale = headerLocale;
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
