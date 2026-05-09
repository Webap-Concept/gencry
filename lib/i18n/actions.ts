"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { users } from "@/lib/db/schema";
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
 *   - Persiste `users.locale` se l'utente è loggato (nelle zone non-prefix
 *     il request loader di next-intl dà priorità a questo valore).
 *   - Estrae il pathname "canonical" dal `currentPath` rimuovendo eventuale
 *     prefix locale presente.
 *   - Calcola la destinazione e redirige SOLO se diversa dal currentPath:
 *     un `redirect()` verso lo stesso path è un no-op a livello di URL ma
 *     può lasciare il router cache lato client a servire il payload RSC
 *     "stantio" → l'utente vede la vecchia lingua finché il cache scade.
 *     Quando non c'è cambio URL, il LanguageSwitcher chiama `router.refresh()`
 *     dopo l'await per invalidare esplicitamente il segment.
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

  const currentUser = await getUser();
  if (currentUser && currentUser.locale !== target) {
    await db
      .update(users)
      .set({ locale: target, updatedAt: new Date() })
      .where(eq(users.id, currentUser.id));
  }

  // Calcola la destinazione finale per la nuova lingua.
  const adminSlug = await getAdminUrlSlug();
  let destination: string;
  if (isNonPrefixablePath(canonicalNormalized, [`/${adminSlug}`])) {
    // Zone non-prefix (admin/protected/auth): la lingua viaggia via cookie+DB,
    // l'URL resta canonico.
    destination = canonicalNormalized;
  } else if (target === DEFAULT_LOCALE) {
    // Path pubblico, lingua di default: niente prefix.
    destination = canonicalNormalized;
  } else {
    // Path pubblico, lingua non-default: aggiungi prefix.
    destination =
      canonicalNormalized === "/"
        ? `/${target}`
        : `/${target}${canonicalNormalized}`;
  }

  // Solo redirect se l'URL effettivamente cambia. Stesso path → ritorno
  // void e lascio al client il router.refresh() per invalidare il cache.
  if (destination !== currentPath) {
    redirect(destination);
  }
}
