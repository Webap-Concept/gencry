"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { ADMIN_NAV, type NavChild, type NavItem } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  BarChart2,
  Bell,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
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
  GripVertical,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Layers,
  LayoutDashboard,
  LineChart,
  ListFilter,
  Lock,
  LogIn,
  MailOpen,
  Map,
  Package,
  PanelTop,
  Plug,
  RotateCcw,
  Scale,
  ScrollText,
  Search,
  SearchX,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserX,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  resetNavOrderAction,
  saveNavOrderAction,
} from "./nav-order-actions";

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
  Plug,
  Shield,
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
  Package,
  LineChart,
  Activity,
  Coins,
  Boxes,
  Clock,
  Bell,
  Scale,
  ScrollText,
  UserX,
  Languages,
  Image: ImageIcon,
};

interface AdminSidebarProps {
  appName: string;
  open?: boolean;
  onClose?: () => void;
  userPermissions: Set<string>;
  isSuperAdmin: boolean;
  /** Override globale dell'ordinamento top-level (mappa key → sortOrder) */
  navOrder: Record<string, number>;
}

/**
 * Applica l'override DB sopra ADMIN_NAV. Le voci con override (sortOrder
 * ∈ navOrder) vengono ordinate per sortOrder; le voci senza override
 * restano dopo, nell'ordine del codice. Risultato deterministico, stabile
 * sui tie.
 */
function applyOrder(
  items: NavItem[],
  order: Record<string, number>,
): NavItem[] {
  return [...items].sort((a, b) => {
    const oa = order[a.key];
    const ob = order[b.key];
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1; // a ha override → prima
    if (ob !== undefined) return 1;  // b ha override → prima
    return 0; // entrambi senza override → ordine codice (stable sort)
  });
}

export default function AdminSidebar({
  appName,
  open,
  onClose,
  userPermissions,
  isSuperAdmin,
  navOrder,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const adminSlug = useAdminSlug();
  // Gli href nel registry ADMIN_NAV sono RELATIVI al base admin (es.
  // "/access/users"). Qui li prefissiamo runtime con lo slug pubblico
  // configurato (`/<slug>/access/users`). Vedi lib/admin-nav.ts.
  const prefixHref = (rel: string) => buildAdminPathFromSlug(adminSlug, rel);
  const tNav = useTranslations("admin.nav");
  const tShell = useTranslations("admin.shell");

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

  // Filtra per permission, applica override DB, e tieni in stato locale
  // (per l'optimistic update durante drag&drop in edit mode).
  const initialVisible = applyOrder(ADMIN_NAV.filter(isItemVisible), navOrder);
  const [visibleNav, setVisibleNav] = useState<NavItem[]>(initialVisible);
  // Re-sync se cambia il prop navOrder (es. dopo router.refresh post-save)
  useEffect(() => {
    setVisibleNav(applyOrder(ADMIN_NAV.filter(isItemVisible), navOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navOrder]);

  // ── Edit-mode (drag & drop ordinamento top-level) ────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function enterEditMode() {
    setEditMode(true);
    setOpenGroupKey(null); // chiudi tutti i gruppi aperti per pulizia
  }
  function exitEditMode() {
    setEditMode(false);
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = visibleNav.findIndex((i) => i.key === active.id);
    const newIdx = visibleNav.findIndex((i) => i.key === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(visibleNav, oldIdx, newIdx);
    setVisibleNav(reordered); // optimistic
    const updates = reordered.map((item, i) => ({
      itemKey: item.key,
      sortOrder: i,
    }));
    startTransition(async () => {
      const res = await saveNavOrderAction(updates);
      if (res.error) {
        // rollback al precedente: ricarica dal navOrder iniziale
        setVisibleNav(applyOrder(ADMIN_NAV.filter(isItemVisible), navOrder));
      }
    });
  }
  function handleReset() {
    startTransition(async () => {
      await resetNavOrderAction();
      setVisibleNav(applyOrder(ADMIN_NAV.filter(isItemVisible), {}));
    });
  }

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

  // Chiudi automaticamente il drawer quando l'utente naviga (click su una
  // sotto-voce o navigazione esterna). pathname cambia → drawer via.
  useEffect(() => {
    setOpenGroupKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function isActive(href: string, exact?: boolean) {
    // `href` è il path RELATIVO dal nav registry (es. "/access/users").
    // Il `pathname` è quello PUBBLICO (es. "/admincontrol/access/users").
    // Confrontiamo dopo aver prefissato lo slug.
    const full = prefixHref(href);
    if (exact) return pathname === full;
    return pathname === full || pathname.startsWith(full + "/");
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
        href={prefixHref(href)}
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

  // Trigger top-level: bottone che apre il drawer overlay con il riepilogo
  // della sezione (titolo + descrizione + sotto-voci). Niente expand
  // in-place: il drawer è renderizzato UNA VOLTA al top del componente
  // sulla base di `openGroupKey`. Il body delle sotto-voci (incluso il
  // 3° livello) sta tutto lì dentro.
  function DrawerTrigger({ item }: { item: NavItem }) {
    const Icon = ICON_MAP[item.icon] ?? Settings;
    const visibleChildren = (item.children ?? []).filter(isChildVisible);
    const isGroupActive = visibleChildren.some(isPathInChild);
    const isOpen = openGroupKey === item.key;

    return (
      <button
        onClick={() => toggleGroup(item.key)}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
        style={{
          background:
            isOpen
              ? "var(--admin-sidebar-item-hover-bg)"
              : isGroupActive
                ? "var(--admin-sidebar-item-active-bg)"
                : "transparent",
          color: isGroupActive || isOpen
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
            isOpen
              ? "var(--admin-sidebar-item-hover-bg)"
              : isGroupActive
                ? "var(--admin-sidebar-item-active-bg)"
                : "transparent";
          e.currentTarget.style.color = isGroupActive || isOpen
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
        <ChevronRight
          size={15}
          className="transition-transform duration-150"
          style={{
            // Quando il drawer è aperto, il chevron diventa "indietro" per
            // suggerire che un secondo click lo chiude.
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            color: "var(--admin-sidebar-icon-inactive)",
          }}
        />
      </button>
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

  // Drawer overlay che mostra il riepilogo della sezione cliccata: titolo
  // + descrizione + lista sotto-voci. Renderizzato una volta al top del
  // componente sulla base di `openGroupKey`. Click outside / Escape /
  // click su una sotto-voce → chiude.
  function SidebarDrawer({ item, onCloseDrawer }: {
    item: NavItem;
    onCloseDrawer: () => void;
  }) {
    const Icon = ICON_MAP[item.icon] ?? Settings;
    const visibleChildren = (item.children ?? []).filter(isChildVisible);
    const description = tNav.has(`descriptions.${item.key}`)
      ? tNav(`descriptions.${item.key}`)
      : null;
    const label = navLabel(item.key, item.label);

    useEffect(() => {
      function onEsc(e: KeyboardEvent) {
        if (e.key === "Escape") onCloseDrawer();
      }
      window.addEventListener("keydown", onEsc);
      return () => window.removeEventListener("keydown", onEsc);
    }, [onCloseDrawer]);

    return (
      <>
        {/* Overlay scrim — copre solo il content area, non la sidebar (che
            resta cliccabile per chiudere/cambiare drawer). */}
        <div
          className="fixed inset-0 z-30 lg:left-[var(--admin-sidebar-width)]"
          style={{ background: "color-mix(in srgb, #000 32%, transparent)" }}
          onClick={onCloseDrawer}
        />
        {/* Panel laterale — desktop: incollato a destra della sidebar.
            Mobile: full-width sotto la sidebar mobile (gestita altrove). */}
        <div
          role="dialog"
          aria-label={label}
          className="fixed top-0 bottom-0 z-40 flex flex-col w-72"
          style={{
            left: "var(--admin-sidebar-width)",
            background:
              "color-mix(in srgb, var(--admin-sidebar-bg) 92%, #fff 8%)",
            borderRight: "1px solid var(--admin-sidebar-border)",
            boxShadow: "8px 0 24px -8px rgba(0,0,0,0.35)",
            animation: "drawer-slide-in 150ms ease-out",
          }}
          onClick={(e) => e.stopPropagation()}>
          <div
            className="px-5 py-4"
            style={{ borderBottom: "1px solid var(--admin-sidebar-border)" }}>
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "color-mix(in srgb, var(--admin-accent) 18%, transparent)",
                }}>
                <Icon size={18} style={{ color: "var(--admin-accent)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--admin-sidebar-text-active)" }}>
                  {label}
                </h3>
                {description && (
                  <p
                    className="text-[11.5px] mt-0.5 leading-snug"
                    style={{ color: "var(--admin-sidebar-text-faint)" }}>
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onCloseDrawer}
                aria-label={tShell("navDrawerClose")}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--admin-sidebar-text-faint)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color =
                    "var(--admin-sidebar-text-active)";
                  e.currentTarget.style.background =
                    "var(--admin-sidebar-item-hover-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color =
                    "var(--admin-sidebar-text-faint)";
                  e.currentTarget.style.background = "transparent";
                }}>
                <X size={14} />
              </button>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
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
                />
              ),
            )}
          </nav>
        </div>
      </>
    );
  }

  // In edit mode, ogni top-level è wrappato con drag handle a sinistra +
  // useSortable. Mostra solo il bottone top-level senza drawer/expand:
  // l'utente sta riordinando, non navigando.
  function SortableTopItem({ item }: { item: NavItem }) {
    const sortable = useSortable({ id: item.key });
    const dragStyle: React.CSSProperties = {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
      opacity: sortable.isDragging ? 0.4 : undefined,
      zIndex: sortable.isDragging ? 10 : undefined,
    };
    return (
      <div
        ref={sortable.setNodeRef}
        style={dragStyle}
        className="flex items-stretch gap-1">
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={tShell("navDragHandle")}
          className="flex items-center justify-center w-5 shrink-0 rounded transition-colors"
          style={{
            color: "var(--admin-sidebar-text-faint)",
            cursor: "grab",
            touchAction: "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--admin-sidebar-text-active)";
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--admin-sidebar-item-hover-bg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--admin-sidebar-text-faint)";
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}>
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">
          {item.children ? (
            // In edit mode, mostriamo SOLO il bottone (con icona + label)
            // senza drawer e senza expand: l'utente sta riordinando.
            <div
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium"
              style={{
                background: "transparent",
                color: "var(--admin-sidebar-text)",
              }}>
              {(() => {
                const Icon = ICON_MAP[item.icon] ?? Settings;
                return (
                  <Icon
                    size={18}
                    style={{ color: "var(--admin-sidebar-icon-inactive)" }}
                  />
                );
              })()}
              <span className="flex-1 text-left">
                {navLabel(item.key, item.label)}
              </span>
            </div>
          ) : (
            <NavLink
              href={item.href!}
              label={navLabel(item.key, item.label)}
              icon={item.icon}
              exact={item.exact}
            />
          )}
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
        {editMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}>
            <SortableContext
              items={visibleNav.map((i) => i.key)}
              strategy={verticalListSortingStrategy}>
              {visibleNav.map((item) => (
                <SortableTopItem key={item.key} item={item} />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visibleNav.map((item) =>
            item.children ? (
              <DrawerTrigger key={item.key} item={item} />
            ) : (
              <NavLink
                key={item.key}
                href={item.href!}
                label={navLabel(item.key, item.label)}
                icon={item.icon}
                exact={item.exact}
              />
            ),
          )
        )}
      </nav>

      <div
        className="px-5 py-3 flex items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--admin-sidebar-border)" }}>
        {editMode ? (
          <>
            <button
              type="button"
              onClick={handleReset}
              title={tShell("navResetTooltip")}
              className="flex items-center gap-1.5 text-[11px] transition-colors"
              style={{ color: "var(--admin-sidebar-text-faint)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--admin-sidebar-text-active)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--admin-sidebar-text-faint)")
              }>
              <RotateCcw size={11} />
              {tShell("navReset")}
            </button>
            <button
              type="button"
              onClick={exitEditMode}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors"
              style={{
                background: "var(--admin-accent)",
                color: "#fff",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.filter = "brightness(0.9)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
              <Check size={12} />
              {tShell("navEditDone")}
            </button>
          </>
        ) : (
          <>
            <Link
              href="/"
              className="text-xs transition-colors"
              style={{ color: "var(--admin-sidebar-text-faint)" }}>
              ← Back to the App
            </Link>
            <button
              type="button"
              onClick={enterEditMode}
              title={tShell("navEditEnter")}
              aria-label={tShell("navEditEnter")}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "var(--admin-sidebar-text-faint)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--admin-sidebar-text-active)";
                e.currentTarget.style.background =
                  "var(--admin-sidebar-item-hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--admin-sidebar-text-faint)";
                e.currentTarget.style.background = "transparent";
              }}>
              <ArrowUpDown size={13} />
            </button>
          </>
        )}
      </div>
    </aside>
  );

  // Il drawer overlay viene renderizzato solo in modalità non-edit e solo
  // se c'è un gruppo aperto. È hosted al top del componente per stare al
  // fianco della sidebar (non dentro il `<aside>` per non venire clippato
  // da overflow-y-auto del nav).
  const activeGroup =
    !editMode && openGroupKey
      ? visibleNav.find((i) => i.key === openGroupKey && i.children)
      : null;

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
      {activeGroup && (
        <SidebarDrawer
          item={activeGroup}
          onCloseDrawer={() => setOpenGroupKey(null)}
        />
      )}
    </>
  );
}
