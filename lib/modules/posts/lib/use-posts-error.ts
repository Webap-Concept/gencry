"use client";
// lib/modules/posts/lib/use-posts-error.ts
//
// Hook che traduce le chiavi i18n ritornate dalle posts server actions.
//
// Le action del modulo posts ritornano:
//   { ok: false, error: "posts.errors.foo", retryAfter?, field? }
// dove `error` è una chiave del namespace "posts" (vedi
// `messages/{en,it}/posts.json`). I client non possono mostrare la
// chiave grezza all'utente — questo hook fa il lookup via next-intl
// + supporta i placeholder ICU (`retryAfter`, `field`).
//
// Fallback: se la chiave non è in posts.json (es. dimenticata dopo un
// rename), ritorna la chiave grezza così la UX non si rompe e il dev
// vede subito il missing message in chiaro.
import { useTranslations } from "next-intl";

type ErrorMeta = {
  retryAfter?: number;
  field?: string;
};

export type PostsErrorInput =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; retryAfter?: number; field?: string };

/**
 * Versione hook: ritorna un translator pronto da invocare con la chiave.
 * Usalo nei componenti che hanno setError(res.error) per più chiamate.
 *
 * @example
 *   const tErr = usePostsError();
 *   const res = await createPost(...);
 *   if (!res.ok) setError(tErr(res.error, res));
 */
export function usePostsError(): (
  key: string | null | undefined,
  meta?: ErrorMeta,
) => string {
  const t = useTranslations("posts");
  return (key, meta) => {
    if (!key) return "";
    // Le chiavi server-side includono il namespace "posts." per essere
    // leggibili nei file action (es. "posts.errors.unauthenticated").
    // useTranslations("posts") risolve relativo al namespace → strip.
    const relative = key.startsWith("posts.")
      ? key.slice("posts.".length)
      : key;
    try {
      const values: Record<string, string | number> = {};
      if (meta?.retryAfter != null) values.retryAfter = meta.retryAfter;
      if (meta?.field != null) values.field = meta.field;
      return t(relative, values);
    } catch {
      // Missing message: ritorna la chiave grezza (no crash, dev vede
      // subito quale chiave manca dal posts.json).
      return key;
    }
  };
}
