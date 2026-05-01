/**
 * ADMIN NAV REGISTRY
 */

export interface NavChild {
  key: string;
  href: string;
  label: string;
  icon: string;
  permission: string;
  comingSoon?: boolean;
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
    permission: "admin:users",
    childrenMaxHeight: "260px",
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
    childrenMaxHeight: "240px",
    children: [
      {
        key: "seo-meta",
        href: "/admin/seo/meta-tags",
        label: "Meta Tags",
        icon: "FileText",
        permission: "admin:seo",
      },
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
        key: "seo-registry",
        href: "/admin/seo/route-registry",
        label: "Route Registry",
        icon: "Map",
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
        key: "settings-signup",
        href: "/admin/settings/signup",
        label: "SignUp",
        icon: "LogIn",
        permission: "admin:settings",
      },
      {
        key: "settings-resend",
        href: "/admin/settings/resend",
        label: "Resend",
        icon: "Send",
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
        key: "settings-redis",
        href: "/admin/settings/redis",
        label: "Redis",
        icon: "Database",
        permission: "admin:settings",
      },
      {
        key: "settings-google",
        href: "/admin/settings/google-oauth",
        label: "Google OAuth",
        icon: "LogIn",
        permission: "admin:settings",
      },
      {
        key: "settings-github",
        href: "/admin/settings/github",
        label: "GitHub CI",
        icon: "GitMerge",
        permission: "admin:settings",
      },
      {
        key: "settings-cloudflare",
        href: "/admin/settings/cloudflare",
        label: "Cloudflare",
        icon: "Shield",
        permission: "admin:settings",
      },
    ],
  },
  {
    key: "prices-group",
    label: "Prices Engine",
    icon: "LineChart",
    permission: "admin:prices",
    childrenMaxHeight: "180px",
    children: [
      {
        key: "prices-overview",
        href: "/admin/prices",
        label: "Health",
        icon: "Activity",
        permission: "admin:prices",
      },
      {
        key: "prices-coins",
        href: "/admin/prices/coins",
        label: "Coins Registry",
        icon: "Coins",
        permission: "admin:prices",
      },
      {
        key: "prices-settings",
        href: "/admin/prices/settings",
        label: "Settings",
        icon: "Settings",
        permission: "admin:prices",
      },
    ],
  },
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

export function getAdminPath(key: string): string {
  for (const item of ADMIN_NAV) {
    if (item.key === key && item.href) {
      return item.href;
    }
    if (item.children) {
      const child = item.children.find((c) => c.key === key);
      if (child) return child.href;
    }
  }
  console.warn(`[getAdminPath] Key "${key}" not found in ADMIN_NAV registry.`);
  return "/admin";
}
