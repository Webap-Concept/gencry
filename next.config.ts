import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // ---------------------------------------------------------------------------
  // Images
  // Aggiungi qui i domini da cui carichi immagini esterne (es. Tiptap, CDN, ecc.)
  // Documentazione: https://nextjs.org/docs/app/api-reference/components/image#remotepatterns
  // ---------------------------------------------------------------------------
  images: {
    remotePatterns: [
      // Supabase Storage (bucket "media", "branding", "avatars" ecc.)
      // Wildcard sull'host: copre qualunque project-ref.supabase.co
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Cloudflare R2 con custom domain del modulo prices (coin images).
      // Wildcard sul subdomain del root: il bucket bind si chiama
      // tipicamente `coins.<root>` ma resta editabile dall'admin in
      // modules.prices.r2.public_base_url. Le coin images usano
      // `unoptimized` quindi questo è solo per i casi futuri/altri host.
      {
        protocol: "https",
        hostname: "*.generazionecrypto.com",
      },
    ],
    // Widths accettati da /_next/image. Next valida `?w=` contro
    // deviceSizes ∪ imageSizes e risponde 400 se il valore non c'è —
    // quindi ogni width usato dai preset in lib/storage/image-widths.ts
    // DEVE comparire qui (o tra imageSizes per width piccole). Quando
    // aggiungi un nuovo preset con width inedita, propagala anche qui.
    deviceSizes: [640, 750, 828, 1024, 1080, 1200, 1440, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 320, 360, 384, 400],
    // Next 15+ valida anche `?q=` contro questa lista (default `[75]` —
    // ogni altro valore risponde 400). I preset in lib/storage/image-widths.ts
    // usano 75 (cmsBody/cmsHero/adminThumb/adminPreview) e 80 (cmsLightbox/
    // cmsLogo). Aggiungere qui ogni quality nuovo introdotto in un preset.
    qualities: [75, 80],
  },

  // ---------------------------------------------------------------------------
  // Experimental (Next.js 16 — aggiorna man mano che le feature stabilizzano)
  // ---------------------------------------------------------------------------
  experimental: {
    // nodeMiddleware: true, // abilita se usi middleware Node.js (non Edge)
    serverActions: {
      // Default Next.js è 1MB: troppo basso per la media library che accetta
      // fino a 10MB per file. Margine extra per multipart overhead + multi-file.
      bodySizeLimit: "15mb",
    },
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
              // dall'admin in /admin/settings/general → bucket "branding") +
              // Cloudflare R2 custom domain del modulo prices (coin images)
              "img-src 'self' data: blob: https://*.supabase.co https://*.generazionecrypto.com",
              // Font locali
              "font-src 'self'",
              // Stripe JS + Cloudflare Turnstile (iframe widget)
              "frame-src 'self' https://js.stripe.com https://challenges.cloudflare.com",
              // Connessioni API: Supabase + Stripe + Resend + GA4/GTM
              // + Cloudflare R2 endpoint S3 (signed PUT da browser per il
              //   modulo Posts media upload — vedi project_module_posts_architecture)
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.resend.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://*.r2.cloudflarestorage.com",
            ].join("; "),
          },
        ],
      },
      // Stripe webhook: nessun CSP restrittivo necessario (solo API POST)
      // ma assicurati di validare stripe-signature nel route handler
    ];
  },
};

// Sentry build plugin: si occupa di iniettare le source maps (se
// SENTRY_AUTH_TOKEN/ORG/PROJECT sono settati come env var Vercel) e di
// instrumentare il bundle.
//
// In locale (senza SENTRY_AUTH_TOKEN) il wrapping viene saltato del
// tutto: il plugin internamente fa trace dell'intero progetto per le
// source maps e con Turbopack genera il warning "Encountered unexpected
// file in NFT list" — rumore inutile su una build dev che non uplaod
// nulla. In CI/Vercel il token c'è ed il plugin si attiva normalmente.
//
// I sample rate / DSN runtime non passano da qui: vivono in app_settings
// e li legge `lib/sentry/config.ts` al cold start (server) o via
// `window.__SENTRY_CONFIG__` (client, iniettato dal root layout).
const withSentry = (cfg: NextConfig): NextConfig => {
  if (!process.env.SENTRY_AUTH_TOKEN) return cfg;
  return withSentryConfig(cfg, {
    // Build-time only. In runtime questi valori non hanno effetto.
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    sourcemaps: { disable: false },
    // Tunnel route: aggira gli ad-blocker (sentry.io spesso bloccato).
    // Niente fetch a sentry.io dal client — passa per /monitoring del
    // tuo dominio. Costo: 1 route extra Next handler.
    tunnelRoute: "/monitoring",
    // Note: `disableLogger` e `automaticVercelMonitors` ora sono opzioni
    // sotto `webpack.*` ma non supportate da Turbopack (Next 16). I default
    // sono già conservativi, lasciamo che il plugin decida.
  }) as NextConfig;
};

export default withSentry(withNextIntl(nextConfig));
