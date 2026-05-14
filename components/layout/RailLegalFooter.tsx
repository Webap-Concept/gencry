// components/layout/RailLegalFooter.tsx
// Mini-footer del right rail per gli utenti loggati: i loggati NON
// vedono il PublicFooter sotto (il ProtectedShell è full-height,
// no scroll documento). Qui replichiamo solo l'essenziale: 3 link
// legali (privacy / cookie / terms) + un link "Pubblicità". Niente
// language switcher né preferenze cookie (quelle restano accessibili
// dal menu utente / settings).
import { getSystemPageSlugs } from "@/lib/db/pages-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function RailLegalFooter() {
  const [slugs, settings, t] = await Promise.all([
    getSystemPageSlugs(),
    getAppSettings(),
    getTranslations("public.footer"),
  ]);

  const items: Array<{ href: string; label: string; external?: boolean }> = [];
  if (slugs.terms) items.push({ href: `/${slugs.terms}`, label: t("terms") });
  if (slugs.cookie) items.push({ href: `/${slugs.cookie}`, label: t("cookiePolicy") });
  if (slugs.privacy) items.push({ href: `/${slugs.privacy}`, label: t("privacy") });

  // "Pubblicità": link a una potenziale pagina dedicata se l'admin la
  // crea (slug "pubblicita"), altrimenti mailto al contatto dell'app.
  const adContactEmail =
    settings.email_from_address?.trim() ||
    (settings.app_domain
      ? `info@${settings.app_domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
      : null);
  items.push(
    adContactEmail
      ? { href: `mailto:${adContactEmail}?subject=Spazi%20pubblicitari`, label: "Pubblicità", external: true }
      : { href: "/", label: "Pubblicità" },
  );

  if (items.length === 0) return null;

  return (
    <footer
      className="text-[11px]"
      style={{ color: "var(--gc-fg-3)" }}
      aria-label="Link legali">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((it) => (
          <li key={it.label}>
            {it.external ? (
              <a
                href={it.href}
                className="hover:underline"
                rel="noopener noreferrer"
                target="_blank">
                {it.label}
              </a>
            ) : (
              <Link href={it.href} prefetch={false} className="hover:underline">
                {it.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </footer>
  );
}
