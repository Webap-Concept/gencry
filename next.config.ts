import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // ---------------------------------------------------------------------------
  // Images
  // Aggiungi qui i domini da cui carichi immagini esterne (es. Tiptap, CDN, ecc.)
  // Documentazione: https://nextjs.org/docs/app/api-reference/components/image#remotepatterns
  // ---------------------------------------------------------------------------
  // images: {
  //   remotePatterns: [
  //     {
  //       protocol: "https",
  //       hostname: "esempio.com",
  //       pathname: "/uploads/**",
  //     },
  //   ],
  // },

  // ---------------------------------------------------------------------------
  // Experimental (Next.js 16 — aggiorna man mano che le feature stabilizzano)
  // ---------------------------------------------------------------------------
  experimental: {
    // nodeMiddleware: true, // abilita se usi middleware Node.js (non Edge)
  },

  // ---------------------------------------------------------------------------
  // Security Headers
  // Applicati a tutte le route. Stripe webhook usa /api/webhooks/stripe.
  // ---------------------------------------------------------------------------
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Impedisce clickjacking
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Blocca MIME sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Controlla referrer info
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Forza HTTPS (abilita solo in produzione con HTTPS attivo)
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Limita accesso a feature browser sensibili
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Content-Security-Policy
          // NOTA: personalizza 'img-src' e 'connect-src' quando aggiungi
          // domini esterni per immagini (Tiptap, CDN, ecc.)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Script: 'unsafe-inline' richiesto da Next.js e Tiptap; Cloudflare Turnstile; GTM
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.googletagmanager.com",
              // Style: 'unsafe-inline' richiesto da Tailwind/CSS-in-JS
              "style-src 'self' 'unsafe-inline'",
              // Immagini: 'self' + Supabase Storage (brand assets caricati
              // dall'admin in /admin/settings/general → bucket "branding")
              "img-src 'self' data: blob: https://*.supabase.co",
              // Font locali
              "font-src 'self'",
              // Stripe JS + Cloudflare Turnstile (iframe widget)
              "frame-src 'self' https://js.stripe.com https://challenges.cloudflare.com",
              // Connessioni API: Supabase + Stripe + Resend + GA4/GTM
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.resend.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
            ].join("; "),
          },
        ],
      },
      // Stripe webhook: nessun CSP restrittivo necessario (solo API POST)
      // ma assicurati di validare stripe-signature nel route handler
    ];
  },
};

export default withNextIntl(nextConfig);
