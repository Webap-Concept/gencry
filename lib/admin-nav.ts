/**
 * ADMIN NAV REGISTRY
 *
 * Le voci "core" sono hardcoded qui sotto.
 * Le voci dei moduli social sono iniettate da `lib/modules/registry.ts`
 * sotto la voce "Modules". Aggiungere/rimuovere un modulo non richiede
 * di toccare questo file: basta editare INSTALLED_MODULES.
 */
import { INSTALLED_MODULES } from "@/lib/modules/registry";

export interface NavChild {
  key: string;
  /** Path linked. Optional only if this NavChild is a sub-group with children. */
  href?: string;
  label: string;
  icon: string;
  permission: string;
  comingSoon?: boolean;
  /** Quando true, il link è "active" SOLO con match esatto del pathname.
   *  Serve per voci-radice di sezione (es. Health è `/admin/modules/prices`,
   *  che è prefisso di `/admin/modules/prices/coins` → senza exact entrambe
   *  risulterebbero attive). Default: false (match con startsWith). */
  exact?: boolean;
  /** Sotto-figli per supportare 3 livelli (es. Modules → Module → Leaf).
   *  Quando presente, il NavChild diventa un sotto-gruppo espandibile e
   *  `href` viene ignorato. */
  children?: NavChild[];
}

export interface NavItem {
  key: string;
  href?: string;
  label: string;
  icon: string;
  permission: string;
  exact?: boolean;
  comingSoon?: boolean;
  children?: NavChild[];
  childrenMaxHeight?: string;
}

export const ADMIN_NAV: NavItem[] = [
  {
    key: "dashboard",
    href: "/admin",
    label: "Dashboard",
    icon: "LayoutDashboard",
    permission: "admin:access",
    exact: true,
  },
  {
    key: "users-group",
    label: "Access",
    icon: "Users",
    // Umbrella: chiunque entri nell'admin (admin:access) può vedere il
    // gruppo se ha almeno un permesso per uno dei figli. Le voci dentro
    // (Users / Staff / Roles / Permissions / Sessions) sono filtrate
    // dalla propria permission. Stesso pattern di "modules-group" qui
    // sotto.
    permission: "admin:access",
    childrenMaxHeight: "300px",
    children: [
      {
        key: "users-list",
        href: "/admin/access/users",
        label: "Users",
        icon: "Users",
        permission: "admin:users",
      },
      {
        key: "users-staff",
        href: "/admin/access/staff",
        label: "Staff",
        icon: "UserCog",
        permission: "admin:staff",
      },
      {
        key: "users-roles",
        href: "/admin/access/roles",
        label: "Roles",
        icon: "ShieldCheck",
        permission: "admin:roles",
      },
      {
        key: "users-permissions",
        href: "/admin/access/permissions",
        label: "Permissions",
        icon: "KeyRound",
        permission: "admin:roles",
      },
      {
        key: "users-sessions",
        href: "/admin/access/sessions",
        label: "Sessions",
        icon: "Activity",
        permission: "admin:sessions",
      },
    ],
  },
  {
    key: "content-group",
    label: "Content",
    icon: "Layers",
    permission: "admin:content",
    childrenMaxHeight: "120px",
    children: [
      {
        key: "content-pages",
        href: "/admin/content/pages",
        label: "Pages",
        icon: "FileText",
        permission: "admin:content",
      },
      {
        key: "content-templates",
        href: "/admin/content/templates",
        label: "Templates",
        icon: "PanelTop",
        permission: "admin:content",
      },
    ],
  },
  {
    key: "analytics",
    href: "/admin/analytics",
    label: "Analytics",
    icon: "BarChart2",
    permission: "admin:analytics",
  },
  {
    key: "moderation",
    href: "/admin/moderation",
    label: "Moderation",
    icon: "ShieldAlert",
    permission: "admin:moderation",
  },
  {
    key: "security-group",
    label: "Security",
    icon: "Lock",
    permission: "admin:security",
    childrenMaxHeight: "220px",
    children: [
      {
        key: "security-bruteforce",
        href: "/admin/security/bruteforce",
        label: "Bruteforce",
        icon: "ShieldBan",
        permission: "admin:security",
      },
      {
        key: "security-ip-rules",
        href: "/admin/security/ip-rules",
        label: "Regole IP",
        icon: "ListFilter",
        permission: "admin:security",
      },
      {
        key: "security-blocked-domains",
        href: "/admin/security/blocked-domains",
        label: "Domini Bloccati",
        icon: "Globe",
        permission: "admin:security",
      },
      {
        key: "security-blocked-usernames",
        href: "/admin/security/blocked-usernames",
        label: "Username Bloccati",
        icon: "UserX",
        permission: "admin:security",
      },
    ],
  },
  {
    key: "compliance-group",
    label: "Compliance",
    icon: "Scale",
    // Umbrella: chi ha admin:gdpr (anche senza admin:access esplicito) può
    // vedere il gruppo. I figli sono filtrati dalla loro permission.
    permission: "admin:gdpr",
    childrenMaxHeight: "160px",
    children: [
      {
        key: "compliance-gdpr",
        href: "/admin/compliance/gdpr",
        label: "GDPR & Consents",
        icon: "ScrollText",
        permission: "admin:gdpr",
      },
      {
        key: "compliance-cookies",
        href: "/admin/compliance/cookies",
        label: "Cookies",
        icon: "Cookie",
        permission: "admin:gdpr",
      },
    ],
  },
  {
    key: "billing-group",
    label: "Billing & Payment",
    icon: "CreditCard",
    permission: "admin:billing",
    comingSoon: true,
    childrenMaxHeight: "220px",
    children: [
      {
        key: "billing-overview",
        href: "/admin/billing",
        label: "General",
        icon: "LayoutDashboard",
        permission: "admin:billing",
        comingSoon: true,
      },
      {
        key: "billing-plans",
        href: "/admin/billing/plans",
        label: "Plans",
        icon: "PackageCheck",
        permission: "billing:manage_plans",
        comingSoon: true,
      },
      {
        key: "billing-transactions",
        href: "/admin/billing/transactions",
        label: "Transactions",
        icon: "ArrowLeftRight",
        permission: "billing:view_transactions",
        comingSoon: true,
      },
      {
        key: "billing-subscriptions",
        href: "/admin/billing/subscriptions",
        label: "Membership",
        icon: "RefreshCcw",
        permission: "subscriptions:manage",
        comingSoon: true,
      },
      {
        key: "billing-gateways",
        href: "/admin/billing/gateways",
        label: "Gateway",
        icon: "Plug",
        permission: "billing:manage_gateways",
        comingSoon: true,
      },
    ],
  },
  {
    key: "seo-group",
    label: "SEO",
    icon: "Search",
    permission: "admin:seo",
    childrenMaxHeight: "290px",
    children: [
      {
        key: "seo-robots",
        href: "/admin/seo/robots",
        label: "Robots",
        icon: "Globe",
        permission: "admin:seo",
      },
      {
        key: "seo-sitemap",
        href: "/admin/seo/sitemap",
        label: "Sitemap",
        icon: "Map",
        permission: "admin:seo",
      },
      {
        key: "seo-redirects",
        href: "/admin/seo/redirect",
        label: "Redirect",
        icon: "GitMerge",
        permission: "admin:seo",
      },
      {
        key: "seo-not-found",
        href: "/admin/seo/not-found",
        label: "404 Monitor",
        icon: "SearchX",
        permission: "admin:seo",
      },
    ],
  },
  {
    key: "settings-group",
    label: "Settings",
    icon: "Settings",
    permission: "admin:settings",
    childrenMaxHeight: "360px",
    children: [
      {
        key: "settings-general",
        href: "/admin/settings/general",
        label: "General",
        icon: "Settings",
        permission: "admin:settings",
      },
      {
        key: "settings-mode",
        href: "/admin/settings/operation-mode",
        label: "Operation Mode",
        icon: "SlidersHorizontal",
        permission: "admin:settings",
      },
      {
        key: "settings-notifications",
        href: "/admin/settings/notifications",
        label: "Notifications",
        icon: "Bell",
        permission: "admin:settings",
      },
      {
        key: "settings-signup",
        href: "/admin/settings/signup",
        label: "SignUp",
        icon: "LogIn",
        permission: "admin:settings",
      },
      {
        key: "settings-email",
        href: "/admin/settings/email",
        label: "Email",
        icon: "MailOpen",
        permission: "admin:settings",
      },
      {
        key: "settings-snippets",
        href: "/admin/settings/snippets",
        label: "Snippets",
        icon: "Code2",
        permission: "admin:settings",
      },
      {
        key: "settings-cron",
        href: "/admin/settings/cron",
        label: "Cron Jobs",
        icon: "Clock",
        permission: "admin:settings",
      },
      {
        key: "settings-languages",
        href: "/admin/settings/languages",
        label: "Languages",
        icon: "Languages",
        permission: "admin:languages",
      },
    ],
  },
  {
    key: "services-group",
    label: "Services",
    icon: "Plug",
    permission: "admin:settings",
    childrenMaxHeight: "260px",
    children: [
      {
        key: "services-resend",
        href: "/admin/services/resend",
        label: "Resend",
        icon: "Send",
        permission: "admin:settings",
      },
      {
        key: "services-redis",
        href: "/admin/services/redis",
        label: "Redis",
        icon: "Database",
        permission: "admin:settings",
      },
      {
        key: "services-google",
        href: "/admin/services/google-oauth",
        label: "Google OAuth",
        icon: "LogIn",
        permission: "admin:settings",
      },
      {
        key: "services-github",
        href: "/admin/services/github",
        label: "GitHub CI",
        icon: "GitMerge",
        permission: "admin:settings",
      },
      {
        key: "services-cloudflare",
        href: "/admin/services/cloudflare",
        label: "Cloudflare",
        icon: "Shield",
        permission: "admin:settings",
      },
      {
        key: "services-supabase",
        href: "/admin/services/supabase",
        label: "Supabase",
        icon: "Database",
        permission: "admin:settings",
      },
      {
        key: "services-storage-s3",
        href: "/admin/services/storage/s3",
        label: "S3 Storage",
        icon: "HardDrive",
        permission: "admin:settings",
      },
      {
        key: "services-dependencies",
        href: "/admin/services/dependencies",
        label: "Dependencies",
        icon: "Package",
        permission: "admin:settings",
      },
    ],
  },
  // ── Modules ──────────────────────────────────────────────────────────
  // Voce sintetica costruita da INSTALLED_MODULES. Ogni modulo è il proprio
  // sotto-gruppo, le sue voci sono i figli del modulo. Tre livelli:
  //   Modules → <Module label> → <leaf>
  //
  // Resta visibile finché c'è almeno un modulo registrato. Per app non-social
  // (registry vuoto) l'item viene filtrato via dal sidebar.
  ...(INSTALLED_MODULES.length > 0
    ? [
        {
          key: "modules-group",
          label: "Modules",
          icon: "Boxes",
          // Permesso "umbrella": basta avere admin:access per vedere il
          // gruppo. I singoli moduli sono filtrati dalle proprie permission.
          permission: "admin:access",
          childrenMaxHeight: `${
            INSTALLED_MODULES.reduce(
              (acc, m) => acc + m.navChildren.length + 1,
              0,
            ) * 44 + 40
          }px`,
          children: INSTALLED_MODULES.map((m) => ({
            key: `module-${m.slug}`,
            label: m.label,
            icon: m.icon,
            permission: m.permission,
            children: m.navChildren,
          })),
        } as NavItem,
      ]
    : []),
  {
    key: "tests",
    href: "/admin/tests",
    label: "Test Suite",
    icon: "FlaskConical",
    permission: "admin:tests",
  },
  {
    key: "logs",
    href: "/admin/logs",
    label: "Activity Logs",
    icon: "ClipboardList",
    permission: "admin:logs",
  },
];

// Ricerca ricorsiva nell'albero della nav: NavChild ora può avere figli
// (3° livello, es. Modules → Prices Engine → Health), quindi la lookup
// non si ferma al 2° livello.
function findHrefByKey(
  items: ReadonlyArray<NavItem | NavChild>,
  key: string,
): string | null {
  for (const item of items) {
    if (item.key === key && item.href) return item.href;
    if (item.children && item.children.length > 0) {
      const found = findHrefByKey(item.children, key);
      if (found) return found;
    }
  }
  return null;
}

export function getAdminPath(key: string): string {
  const found = findHrefByKey(ADMIN_NAV, key);
  if (found) return found;
  console.warn(`[getAdminPath] Key "${key}" not found in ADMIN_NAV registry.`);
  return "/admin";
}
