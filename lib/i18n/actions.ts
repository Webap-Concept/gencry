"use server";

import { redirect } from "next/navigation";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from "./config";
import { setLocaleCookie } from "./locale-cookie";
import { isNonPrefixablePath } from "./resolve-locale";

/**
 * Cambia il locale corrente e ridirige all'URL appropriato per la nuova
 * lingua. Pensata per il LanguageSwitcher pubblico.
 *
 * Logica:
 *   - Setta cookie `NEXT_LOCALE` = target.
 *   - Estrae il pathname "canonical" dal `currentPath` rimuovendo eventuale
 *     prefix locale presente.
 *   - Se il path canonical è non-prefixable (auth/admin/loggato/api) → redirect
 *     a quel path senza prefix (la nuova lingua viaggia via cookie).
 *   - Se il path è pubblico (home / CMS) → redirect a `/<target><path>`
 *     quando target ≠ default, altrimenti al path canonical (no prefix).
 */
export async function switchLocaleAction(formData: FormData): Promise<void> {
  const targetRaw = formData.get("locale");
  const currentPathRaw = formData.get("currentPath");

  if (typeof targetRaw !== "string" || !isLocale(targetRaw)) return;
  if (typeof currentPathRaw !== "string") return;

  const target = targetRaw as Locale;
  const currentPath = currentPathRaw.startsWith("/") ? currentPathRaw : "/";

  // Estrai canonical path (senza locale prefix)
  const segments = currentPath.split("/").filter(Boolean);
  const first = segments[0];
  const hasPrefix = first ? (LOCALES as readonly string[]).includes(first) : false;
  const canonical = hasPrefix
    ? "/" + segments.slice(1).join("/")
    : currentPath;
  const canonicalNormalized = canonical === "" ? "/" : canonical;

  await setLocaleCookie(target);

  // Path non-prefixable: niente prefix, cookie già aggiornato. Lo slug
  // admin runtime è incluso negli `extraPrefixes` per coprire valori
  // diversi dal default "admin".
  const adminSlug = await getAdminUrlSlug();
  if (isNonPrefixablePath(canonicalNormalized, [`/${adminSlug}`])) {
    redirect(canonicalNormalized);
  }

  // Path pubblico (home/CMS): aggiungi prefix solo se ≠ default
  if (target === DEFAULT_LOCALE) {
    redirect(canonicalNormalized);
  } else {
    const dest =
      canonicalNormalized === "/"
        ? `/${target}`
        : `/${target}${canonicalNormalized}`;
    redirect(dest);
  }
}
