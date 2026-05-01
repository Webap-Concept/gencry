"use client";

import { ADMIN_NAV, type NavChild, type NavItem } from "@/lib/admin-nav";
import {
  Activity,
  ArrowRight,
  BarChart2,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Code2,
  Coins,
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
  Search,
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
  Database,
  LineChart,
  Activity,
  Coins,
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

  function hasPerm(permission: string): boolean {
    if (isSuperAdmin) return true;
    return userPermissions.has(permission);
  }

  const visibleNav: NavItem[] = ADMIN_NAV.filter((item) => {
    if (!hasPerm(item.permission)) return false;
    if (item.children) {
      return item.children.some((c) => hasPerm(c.permission));
    }
    return true;
  });

  // Logica Accordion: teniamo traccia solo della chiave del sottomenu aperto
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(() => {
    const initial = visibleNav.find((item) =>
      item.children?.some((c) => pathname.startsWith(c.href)),
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

  // Sotto-componente per i gruppi espandibili
  function ExpandableGroup({ item }: { item: NavItem }) {
    const Icon = ICON_MAP[item.icon] ?? Settings;
    const visibleChildren = (item.children ?? []).filter((c) =>
      hasPerm(c.permission),
    );
    const isGroupActive = visibleChildren.some((c) =>
      pathname.startsWith(c.href),
    );
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
          <span className="flex-1 text-left">{item.label}</span>
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
            {visibleChildren.map((child: NavChild) => (
              <NavLink
                key={child.href}
                href={child.href}
                label={child.label}
                icon={child.icon}
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
              label={item.label}
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
