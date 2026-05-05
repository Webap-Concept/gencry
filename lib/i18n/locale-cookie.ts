import "server-only";

import { cookies } from "next/headers";
import { isLocale, type Locale } from "./config";

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const LOCALE_COOKIE_OPTIONS = {
  maxAge: ONE_YEAR_SECONDS,
  sameSite: "lax" as const,
  path: "/",
  // Non httpOnly: il LanguageSwitcher lato client può leggerlo per evidenziare
  // la lingua corrente. Non contiene informazioni sensibili.
  httpOnly: false,
};

export async function getLocaleCookie(): Promise<Locale | null> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE_NAME)?.value;
  return value && isLocale(value) ? value : null;
}

export async function setLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, LOCALE_COOKIE_OPTIONS);
}
