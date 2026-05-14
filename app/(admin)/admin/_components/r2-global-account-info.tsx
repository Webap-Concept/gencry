// app/(admin)/admin/_components/r2-global-account-info.tsx
//
// Info box riusabile dai form R2 dei moduli per indicare DA DOVE
// arriva l'account_id Cloudflare (è globale, non per-modulo). Evita
// di duplicare il campo `account_id` in N form admin.
//
// Pattern: server component, riceve `accountId: string | null` + il
// path del settings core di Cloudflare (con admin slug già preposto).
//
// Stati renderizzati:
//   - accountId presente   → info box "✓ Configurato in /services/cloudflare"
//   - accountId mancante   → warning "⚠ Configura prima l'Account globale"
//                            + link CTA all'admin page core
import Link from "next/link";

type Props = {
  accountId: string | null;
  /** Path admin page dove l'account_id è gestito (slug-aware). */
  cloudflareSettingsHref: string;
};

export function R2GlobalAccountInfo({ accountId, cloudflareSettingsHref }: Props) {
  if (accountId) {
    // Mostra solo gli ultimi 6 char del id (no security, ma evita di
    // spammare 32-char hash nelle UI delle settings di N moduli)
    const masked = `…${accountId.slice(-6)}`;
    return (
      <div
        className="rounded-md p-3 text-sm flex items-start gap-2"
        style={{
          background:
            "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
          border:
            "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
        }}
      >
        <span aria-hidden="true">ℹ</span>
        <div className="flex-1">
          <p style={{ color: "var(--admin-text)" }}>
            Account Cloudflare:{" "}
            <code className="font-mono text-xs">{masked}</code>
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}
          >
            Gestito globalmente —{" "}
            <Link
              href={cloudflareSettingsHref}
              className="underline hover:no-underline"
              style={{ color: "var(--admin-accent)" }}
            >
              modificalo qui
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-md p-3 text-sm flex items-start gap-2"
      style={{
        background: "color-mix(in srgb, var(--admin-destructive) 8%, var(--admin-card-bg))",
        border:
          "1px solid color-mix(in srgb, var(--admin-destructive) 30%, transparent)",
      }}
      role="alert"
    >
      <span aria-hidden="true">⚠</span>
      <div className="flex-1">
        <p style={{ color: "var(--admin-text)" }}>
          Account Cloudflare non configurato.
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--admin-text-muted)" }}>
          Configura prima l&apos;Account ID globale in{" "}
          <Link
            href={cloudflareSettingsHref}
            className="underline hover:no-underline"
            style={{ color: "var(--admin-accent)" }}
          >
            Servizi → Cloudflare
          </Link>
          , poi torna qui per le credenziali specifiche del modulo.
        </p>
      </div>
    </div>
  );
}
