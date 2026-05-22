"use client";
// components/auth/SignUpCta.tsx
//
// Mini-CTA usato come `fallback` di `<AuthGate>`. Mostra un copy
// contextual all'intent (reazione, commento, bookmark, repost, follow)
// + 2 bottoni Iscriviti / Accedi.
//
// Stile compatto inline per stare sotto/sopra il bottone gated senza
// rompere il layout. Per CTA full-section vedi `AnonymousCta` nella
// coin page (pattern diverso, sostanzioso).
import Link from "next/link";
import { useTranslations } from "next-intl";

/** Azione richiesta che ha triggerato il CTA. Determina il copy. */
export type AuthCtaIntent =
  | "react"
  | "comment"
  | "bookmark"
  | "repost"
  | "follow"
  | "default";

export function SignUpCta({
  intent = "default",
  inline = true,
}: {
  intent?: AuthCtaIntent;
  /** True (default) = layout compatto inline. False = blocco verticale. */
  inline?: boolean;
}) {
  const t = useTranslations("auth.cta");
  const message = t(`intent.${intent}`);
  return (
    <div
      className={
        inline
          ? "inline-flex items-center gap-2 text-xs text-gc-fg-3"
          : "flex flex-col gap-2 text-sm text-gc-fg-2"
      }
    >
      <span>{message}</span>
      <div className="inline-flex items-center gap-1.5">
        <Link
          href="/sign-up"
          prefetch={false}
          className="font-medium text-gc-accent hover:underline"
        >
          {t("sign_up")}
        </Link>
        <span className="text-gc-fg-3" aria-hidden>
          ·
        </span>
        <Link
          href="/sign-in"
          prefetch={false}
          className="text-gc-fg-2 hover:underline"
        >
          {t("sign_in")}
        </Link>
      </div>
    </div>
  );
}
