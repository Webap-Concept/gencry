"use client";

import { switchLocaleAction } from "@/lib/i18n/actions";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useRouter } from "next/navigation";
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
 * `NEXT_LOCALE`, persiste `users.locale` e (se serve cambiare URL) fa
 * redirect alla destinazione corretta per la nuova lingua.
 *
 * Quando la destinazione coincide col path corrente (zone non-prefix come
 * admin/protected) la server action non fa redirect: serve un
 * `router.refresh()` esplicito per invalidare il router cache, altrimenti
 * il segment renderizzato resta in cache e si vede la vecchia lingua finché
 * il cache scade da solo.
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
  const router = useRouter();

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
          startTransition(async () => {
            await switchLocaleAction(formData);
            // Se la server action ha fatto redirect, l'await non torna mai
            // (throw NEXT_REDIRECT). Se siamo qui significa stesso URL →
            // forziamo il refresh del segment per ricaricare i Server
            // Components con i nuovi messages.
            router.refresh();
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
