"use client";

import { switchLocaleAction } from "@/lib/i18n/actions";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useTransition } from "react";

const LABELS: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
};

/**
 * Selettore di lingua per il frontend pubblico.
 *
 * Pattern volutamente minimale (`<select>` accessibile, no flag-only) per
 * a11y. Quando l'utente cambia opzione, una Server Action setta il cookie
 * `NEXT_LOCALE` e fa redirect all'URL corretto per la nuova lingua
 * (vedi `switchLocaleAction` per la logica di routing per zona).
 *
 * Non è ancora integrato nel footer/header — sarà messo in posa in PR-4
 * quando inizieremo a migrare i testi pubblici.
 */
export function LanguageSwitcher({
  current,
  currentPath,
  className,
}: {
  current: Locale;
  currentPath: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className={className}>
      <span className="sr-only">Language</span>
      <select
        defaultValue={current}
        disabled={pending}
        onChange={(event) => {
          const target = event.target.value;
          if (!(LOCALES as readonly string[]).includes(target)) return;
          const formData = new FormData();
          formData.append("locale", target);
          formData.append("currentPath", currentPath);
          startTransition(() => {
            void switchLocaleAction(formData);
          });
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
