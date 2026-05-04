/**
 * lib/routes.ts
 *
 * Fonte di verità per le route UI (nav, menu, footer) e per il
 * kernel di sicurezza del proxy.
 *
 * ─── ROUTING AUTH / VISIBILITY ────────────────────────────────────────
 * La logica public / private / admin / auth-only è gestita dalla
 * tabella `pages` (campo `visibility`) — vedi proxy.ts. Le costanti qui
 * sotto sono il kernel hardcoded per le route di sistema che non
 * possono dipendere dalla disponibilità del DB (auth + admin sign-in).
 *
 * Storico: prima del PR system-pages-auth questa logica viveva nella
 * tabella `route_registry`, oggi droppata. La gestione dei meta SEO e
 * della visibility delle route editoriali si fa da
 * /admin/content/pages → tab Sistema.
 */

// ---------------------------------------------------------------------------
// KERNEL DI SICUREZZA — usato da proxy.ts
// Queste route sono gestite con logica hardcoded nel proxy PRIMA della
// lettura DB, per garantire che autenticazione e onboarding funzionino
// anche in caso di DB irraggiungibile o registry vuoto.
// ---------------------------------------------------------------------------

/**
 * Route di autenticazione: accessibili solo a utenti NON autenticati.
 * Se l'utente è loggato viene rediretto a /.
 * Corrispondono ai record con visibility = "auth-only" e isSystemRoute = true nel DB.
 */
export const SYSTEM_AUTH_ROUTES = ["/sign-in", "/sign-up"] as const;

/**
 * Route di sistema sempre pubbliche, bypass totale del DB registry.
 * Non richiedono sessione, non vengono mai bloccate dal proxy.
 * Corrispondono ai record con visibility = "public" e isSystemRoute = true nel DB.
 */
export const SYSTEM_ALWAYS_PUBLIC = [
  "/verify-email",
  "/forgot-password",
  "/reset-password",
] as const;

/**
 * Costante singola per la route di login admin.
 * Separata per evitare magic strings in proxy.ts e nei guard.
 */
export const ADMIN_SIGNIN_ROUTE = "/admin/sign-in" as const;

// ---------------------------------------------------------------------------
// NAVIGAZIONE FRONTEND — usati dai componenti UI
// Migrazione pianificata: in futuro verranno letti dal DB via
 // getNavRoutes() / getFooterRoutes() per permettere personalizzazione
// dall'admin senza deploy.
// ---------------------------------------------------------------------------

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "Home" },
  { href: "/esplora", label: "Esplora", icon: "Search" },
  { href: "/libreria", label: "Libreria", icon: "BookOpen" },
] as const;

export const USER_MENU_ITEMS = [
  { href: "/profilo", label: "Profilo", icon: "User" },
  { href: "/account", label: "Impostazioni e privacy", icon: "Settings" },
  { href: "/assistenza", label: "Assistenza", icon: "HelpCircle" },
  { href: "/segnala", label: "Segnala un problema", icon: "AlertTriangle" },
] as const;

export const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/condizioni", label: "Condizioni" },
  { href: "/cookie", label: "Cookie" },
] as const;
