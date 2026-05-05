"use client";

import { ADMIN_NAV, type NavChild, type NavItem } from "@/lib/admin-nav";
import { useTranslations } from "next-intl";
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bell,
  BookOpen,
  Boxes,
  ChevronDown,
  ClipboardList,
  Clock,
  Code2,
  Coins,
  Cookie,
  Database,
  FileText,
  FlaskConical,
  GitMerge,
  Globe,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  ListFilter,
  Lock,
  LogIn,
  MailOpen,
  Map,
  PanelTop,
  Scale,
  ScrollText,
  Search,
  SearchX,
  Send,
  Settings,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  UserCog,
  ShieldCheck,
  ShieldBan,
  KeyRound,
  Layers,
  PanelTop,
  BarChart2,
  ShieldAlert,
  Search,
  SearchX,
  FileText,
  GitMerge,
  Globe,
  Map,
  Settings,
  ClipboardList,
  ArrowRight,
  FlaskConical,
  Lock,
  ListFilter,
  SlidersHorizontal,
  LogIn,
  Send,
  MailOpen,
  Code2,
  Cookie,
  Database,
  LineChart,
  Activity,
  Coins,
  Boxes,
  Clock,
  Bell,
  Scale,
  ScrollText,
};

interface AdminSidebarProps {
  appName: string;
  open?: boolean;
  onClose?: () => void;
  userPermissions: Set<string>;
  isSuperAdmin: boolean;
}

export default function AdminSidebar({
  appName,
  open,
  onClose,
  userPermissions,
  isSuperAdmin,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const tNav = useTranslations("admin.nav");

  /**
   * Resolve label per nav item:
   * - voci core (es. "users-list", "settings-general") hanno la chiave i18n
   *   in messages/{en,it}/admin.json sotto admin.nav.<key> → tradotte
   * - voci dinamiche dei moduli (es. "module-prices", "prices-overview")
   *   non hanno chiave i18n e ricadono sull'item.label originale dal manifest.
   * Quando i moduli porteranno i propri messages files (vedi piano i18n),
   * questo fallback diventerà obsoleto.
   */
  function navLabel(key: string, fallback: string): string {
    return tNav.has(key) ? tNav(key) : fallback;
  }

  function hasPerm(permission: string): boolean {
    if (isSuperAdmin) return true;
    return userPermissions.has(permission);
  }

  // Filtra ricorsivamente: un nodo è visibile se l'utente ha la permission
  // E (è una foglia OR ha almeno un discendente visibile).
  function isChildVisible(child: NavChild): boolean {
    if (!hasPerm(child.permission)) return false;
    if (child.children && child.children.length > 0) {
      return child.children.some(isChildVisible);
    }
    return true;
  }
  function isItemVisible(item: NavItem): boolean {
    if (!hasPerm(item.permission)) return false;
    if (item.children && item.children.length > 0) {
      return item.children.some(isChildVisible);
    }
    return true;
  }

  const visibleNav: NavItem[] = ADMIN_NAV.filter(isItemVisible);

  // Helper: dato un NavChild, trova ricorsivamente tutti gli href delle sue
  // foglie. Serve per decidere se un sotto-gruppo è "active" (path matchato).
  function collectChildHrefs(child: NavChild): string[] {
    if (child.children && child.children.length > 0) {
      return child.children.flatMap(collectChildHrefs);
    }
    return child.href ? [child.href] : [];
  }

  function isPathInChild(child: NavChild): boolean {
    return collectChildHrefs(child).some((h) => pathname.startsWith(h));
  }

  // Top-level accordion: una sola voce open alla volta (UX classica).
  // I sotto-gruppi (3° livello) hanno il proprio state indipendente.
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(() => {
    const initial = visibleNav.find((item) =>
      item.children?.some(isPathInChild),
    );
    return initial ? initial.key : null;
  });

  function toggleGroup(key: string) {
    setOpenGroupKey((prev) => (prev === key ? null : key));
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Sotto-componente per i link semplici
  function NavLink({
    href,
    label,
    icon: iconName,
    exact,
    sub,
  }: {
    href: string;
    label: string;
    icon: string;
    exact?: boolean;
    sub?: boolean;
  }) {
    const Icon = ICON_MAP[iconName] ?? Settings;
    const active = isActive(href, exact);
    return (
      <Link
        href={href}
        onClick={onClose}
        className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
          sub ? "px-3 py-2 ml-3" : "px-3 py-2.5"
        }`}
        style={{
          background: active
            ? "var(--admin-sidebar-item-active-bg)"
            : "transparent",
          color: active
            ? "var(--admin-sidebar-text-active)"
            : "var(--admin-sidebar-text)",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = sub
              ? "color-mix(in srgb, var(--admin-sidebar-bg) 60%, #000 40%)"
              : "var(--admin-sidebar-item-hover-bg)";
            e.currentTarget.style.color = "var(--admin-sidebar-text-active)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--admin-sidebar-text)";
          }
        }}>
        <Icon
          size={sub ? 15 : 18}
          style={{
            color: active
              ? "var(--admin-accent)"
              : "var(--admin-sidebar-icon-inactive)",
          }}
        />
        {label}
        {active && (
          <span
            className="ml-auto w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--admin-accent)" }}
          />
        )}
      </Link>
    );
  }

  // Sotto-componente per i gruppi top-level espandibili.
  // Children possono essere foglie (NavLink) o sotto-gruppi (SubExpandableGroup)
  // se il NavChild ha figli a sua volta — abilita il 3° livello.
  function ExpandableGroup({ item }: { item: NavItem }) {
    const Icon = ICON_MAP[item.icon] ?? Settings;
    const visibleChildren = (item.children ?? []).filter(isChildVisible);
    const isGroupActive = visibleChildren.some(isPathInChild);
    const isOpen = openGroupKey === item.key;

    return (
      <div>
        <button
          onClick={() => toggleGroup(item.key)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            background:
              isGroupActive && !isOpen
                ? "var(--admin-sidebar-item-active-bg)"
                : "transparent",
            color: isGroupActive
              ? "var(--admin-sidebar-text-active)"
              : "var(--admin-sidebar-text)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              "var(--admin-sidebar-item-hover-bg)";
            e.currentTarget.style.color = "var(--admin-sidebar-text-active)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              isGroupActive && !isOpen
                ? "var(--admin-sidebar-item-active-bg)"
                : "transparent";
            e.currentTarget.style.color = isGroupActive
              ? "var(--admin-sidebar-text-active)"
              : "var(--admin-sidebar-text)";
          }}>
          <Icon
            size={18}
            style={{
              color: isGroupActive
                ? "var(--admin-accent)"
                : "var(--admin-sidebar-icon-inactive)",
            }}
          />
          <span className="flex-1 text-left">{navLabel(item.key, item.label)}</span>
          <ChevronDown
            size={15}
            className="transition-transform duration-200"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              color: "var(--admin-sidebar-icon-inactive)",
            }}
          />
        </button>

        <div
          className="grid transition-[grid-template-rows] duration-200"
          style={{
            gridTemplateRows: isOpen ? "1fr" : "0fr",
            opacity: isOpen ? 1 : 0,
          }}>
          <div className="overflow-hidden min-h-0">
            <div
              className="mt-0.5 mb-0.5 mx-1 rounded-lg py-1 space-y-0.5"
              style={{
                background:
                  "color-mix(in srgb, var(--admin-sidebar-bg) 70%, #000 30%)",
              }}>
              {visibleChildren.map((child) =>
                child.children && child.children.length > 0 ? (
                  <SubExpandableGroup key={child.key} item={child} />
                ) : (
                  <NavLink
                    key={child.key}
                    href={child.href!}
                    label={navLabel(child.key, child.label)}
                    icon={child.icon}
                    exact={child.exact}
                    sub
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sotto-gruppo (3° livello). State indipendente: ognuno si apre/chiude
  // singolarmente, senza accordion forzato. Auto-open se la route attuale
  // matcha una foglia interna.
  function SubExpandableGroup({ item }: { item: NavChild }) {
    const Icon = ICON_MAP[item.icon] ?? Settings;
    const visibleChildren = (item.children ?? []).filter(isChildVisible);
    const isGroupActive = visibleChildren.some(isPathInChild);
    const [isOpen, setIsOpen] = useState(isGroupActive);

    return (
      <div>
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-2 ml-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: isGroupActive && !isOpen
              ? "color-mix(in srgb, var(--admin-sidebar-bg) 50%, #000 50%)"
              : "transparent",
            color: isGroupActive
              ? "var(--admin-sidebar-text-active)"
              : "var(--admin-sidebar-text)",
          }}
          onMouseEnter={(e) => {
            if (!isGroupActive || isOpen) {
              e.currentTarget.style.background =
                "color-mix(in srgb, var(--admin-sidebar-bg) 60%, #000 40%)";
              e.currentTarget.style.color = "var(--admin-sidebar-text-active)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isGroupActive && !isOpen
              ? "color-mix(in srgb, var(--admin-sidebar-bg) 50%, #000 50%)"
              : "transparent";
            e.currentTarget.style.color = isGroupActive
              ? "var(--admin-sidebar-text-active)"
              : "var(--admin-sidebar-text)";
          }}>
          <Icon
            size={15}
            style={{
              color: isGroupActive
                ? "var(--admin-accent)"
                : "var(--admin-sidebar-icon-inactive)",
            }}
          />
          <span className="flex-1 text-left">{navLabel(item.key, item.label)}</span>
          <ChevronDown
            size={13}
            className="transition-transform duration-200"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              color: "var(--admin-sidebar-icon-inactive)",
            }}
          />
        </button>

        <div
          className="grid transition-[grid-template-rows] duration-200"
          style={{
            gridTemplateRows: isOpen ? "1fr" : "0fr",
            opacity: isOpen ? 1 : 0,
          }}>
          <div className="overflow-hidden min-h-0">
            <div className="mt-0.5 mb-0.5 ml-6 space-y-0.5">
              {visibleChildren.map((leaf) => (
                <NavLink
                  key={leaf.key}
                  href={leaf.href!}
                  label={navLabel(leaf.key, leaf.label)}
                  icon={leaf.icon}
                  exact={leaf.exact}
                  sub
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const content = (
    <aside
      className="w-[var(--admin-sidebar-width)] h-full flex flex-col"
      style={{
        background: "var(--admin-sidebar-bg)",
        color: "var(--admin-sidebar-text-active)",
      }}>
      <div
        className="flex items-center justify-between px-6 py-5"
        style={{ borderBottom: "1px solid var(--admin-sidebar-border)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--admin-accent)" }}>
            <BookOpen size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-wide">{appName}</span>
            <span
              className="block text-[10px] uppercase tracking-widest"
              style={{ color: "var(--admin-sidebar-text-faint)" }}>
              Admin Panel
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg transition-colors"
            style={{ color: "var(--admin-sidebar-text)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                "var(--admin-sidebar-item-hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }>
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) =>
          item.children ? (
            <ExpandableGroup key={item.key} item={item} />
          ) : (
            <NavLink
              key={item.key}
              href={item.href!}
              label={navLabel(item.key, item.label)}
              icon={item.icon}
              exact={item.exact}
            />
          ),
        )}
      </nav>

      <div
        className="px-5 py-4"
        style={{ borderTop: "1px solid var(--admin-sidebar-border)" }}>
        <Link
          href="/"
          className="text-xs transition-colors"
          style={{ color: "var(--admin-sidebar-text-faint)" }}>
          ← Back to the App
        </Link>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:flex shrink-0 h-full">{content}</div>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[var(--admin-sidebar-width)] lg:hidden">
            {content}
          </div>
        </>
      )}
    </>
  );
}
