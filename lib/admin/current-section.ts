// lib/admin/current-section.ts
//
// Lookup statico URL → { iconName, label } per la sezione admin
// corrente, usato dalla topbar di AdminShellClient per mostrare
// icona + titolo dinamico al posto del placeholder "Pannello Admin".
//
// Pattern:
//   - Le sezioni core (access, security, content, settings, compliance,
//     seo, services) hanno una `navKey` che è quella già esistente in
//     messages/<locale>/admin.json sotto `admin.nav.<key>` — riusiamo
//     l'i18n senza nuove keys.
//   - I moduli (posts, prices, seeders, onboarding) hanno un `label`
//     statico — non sono nell'i18n core, vengono dai loro manifest.
//   - Pagine senza sub-tabs (logs, tests, notifications) hanno la
//     loro entry singola.
//
// La topbar fa: estrae il segmento dalla pathname → lookup qui → render.
// Fallback: se l'URL non matcha, la topbar mostra il default
// "Pannello Admin" (cioè il vecchio comportamento).

export type AdminCurrentSection = {
  /** Nome icona Lucide registrato in NAV_ICON_MAP. */
  iconName: string;
  /** Se valorizzata, traduci con `useTranslations("admin.nav")(navKey)`. */
  navKey?: string;
  /** Se valorizzata, usa direttamente questo label (moduli, niente i18n). */
  label?: string;
};

const SECTION_MAP: Record<string, AdminCurrentSection> = {
  // Core sections
  "access":     { iconName: "Users",       navKey: "users-group" },
  "security":   { iconName: "Shield",      navKey: "security-group" },
  "content":    { iconName: "FileText",    navKey: "content-group" },
  "settings":   { iconName: "Settings",    navKey: "settings-group" },
  "compliance": { iconName: "Scale",       navKey: "compliance-group" },
  "seo":        { iconName: "Search",      navKey: "seo-group" },
  "services":   { iconName: "Plug",        navKey: "services-group" },
  "logs":       { iconName: "ScrollText",  navKey: "logs" },
  "tests":      { iconName: "FlaskConical", navKey: "tests" },
  "notifications": { iconName: "Bell",     label: "Notifiche" },

  // Modules — label diretto dai loro manifest
  "modules/posts":         { iconName: "MessageSquare", label: "Posts" },
  "modules/prices":        { iconName: "LineChart",    label: "Prices Engine" },
  "modules/seeders":       { iconName: "Sprout",       label: "Seeders" },
  "modules/onboarding":    { iconName: "Sparkles",     label: "Onboarding" },
  "modules/notifications": { iconName: "Bell",         label: "Notifications" },
  "modules/news":          { iconName: "Newspaper",    label: "News" },
};

/**
 * Estrae la chiave-sezione dal pathname admin. Es:
 *   /businessmanager/settings/email          → "settings"
 *   /businessmanager/modules/posts/reports   → "modules/posts"
 *   /businessmanager                          → null (dashboard, no header)
 *
 * Ritorna null se l'URL non matcha nessuna sezione mappata: il caller
 * (topbar) farà fallback al vecchio titolo "Pannello Admin".
 */
export function getAdminCurrentSection(
  pathname: string,
  adminSlug: string,
): AdminCurrentSection | null {
  const prefix = `/${adminSlug}`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/^\/+/, "");
  if (rest.length === 0) return null;

  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  // I moduli hanno path /modules/<slug>/...: prendiamo i primi 2 segmenti.
  if (parts[0] === "modules" && parts.length >= 2) {
    return SECTION_MAP[`modules/${parts[1]}`] ?? null;
  }

  return SECTION_MAP[parts[0]] ?? null;
}
