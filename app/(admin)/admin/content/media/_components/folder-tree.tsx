"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { MediaFolder } from "@/lib/db/media-queries";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Loader2,
  MoreVertical,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  createMediaFolder,
  deleteMediaFolder,
  renameMediaFolder,
  type ActionState,
} from "../actions";

interface FolderTreeProps {
  folders: MediaFolder[];
  currentFolderId: number | null;
}

interface FolderNode extends MediaFolder {
  children: FolderNode[];
}

function buildTree(folders: MediaFolder[]): FolderNode[] {
  const byId = new Map<number, FolderNode>();
  folders.forEach((f) => byId.set(f.id, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node); // orphan: tratta come root
    }
  }
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function FolderTree({ folders, currentFolderId }: FolderTreeProps) {
  const t = useTranslations("admin.content.media.tree");
  const tree = useMemo(() => buildTree(folders), [folders]);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Modale unificato per create/rename. parentId = create new in that folder
  // (null = root). targetId = renaming folder. Solo uno dei due.
  const [dialog, setDialog] = useState<
    | { kind: "create"; parentId: number | null }
    | { kind: "rename"; folder: MediaFolder }
    | { kind: "delete"; folder: MediaFolder }
    | null
  >(null);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {t("title")}
        </h3>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create", parentId: null })}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: "var(--admin-text-muted)" }}
          aria-label={t("newRoot")}
          title={t("newRoot")}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <ul className="space-y-0.5">
        <li>
          <RootLink isActive={currentFolderId === null} label={t("root")} />
        </li>
        {tree.map((node) => (
          <FolderNodeRow
            key={node.id}
            node={node}
            depth={0}
            currentFolderId={currentFolderId}
            onCreate={(parentId) => setDialog({ kind: "create", parentId })}
            onRename={(folder) => setDialog({ kind: "rename", folder })}
            onDelete={(folder) => setDialog({ kind: "delete", folder })}
          />
        ))}
        {tree.length === 0 && (
          <li
            className="text-xs px-2 py-2"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("emptyTree")}
          </li>
        )}
      </ul>

      {dialog?.kind === "create" && (
        <CreateOrRenameDialog
          mode="create"
          parentId={dialog.parentId}
          onClose={() => setDialog(null)}
          onSuccess={(msg) => {
            setToast({ message: msg, type: "success" });
            setDialog(null);
          }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}
      {dialog?.kind === "rename" && (
        <CreateOrRenameDialog
          mode="rename"
          folder={dialog.folder}
          onClose={() => setDialog(null)}
          onSuccess={(msg) => {
            setToast({ message: msg, type: "success" });
            setDialog(null);
          }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteFolderDialog
          folder={dialog.folder}
          onClose={() => setDialog(null)}
          onSuccess={(msg) => {
            setToast({ message: msg, type: "success" });
            setDialog(null);
          }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}

function RootLink({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <Link
      href="/admin/content/media"
      className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
      style={{
        background: isActive ? "var(--admin-accent-soft, rgba(0,0,0,0.05))" : "transparent",
        color: isActive ? "var(--admin-accent)" : "var(--admin-text)",
        fontWeight: isActive ? 600 : 400,
      }}>
      {isActive ? (
        <FolderOpen className="w-4 h-4" />
      ) : (
        <FolderClosed className="w-4 h-4" />
      )}
      <span>{label}</span>
    </Link>
  );
}

function FolderNodeRow({
  node,
  depth,
  currentFolderId,
  onCreate,
  onRename,
  onDelete,
}: {
  node: FolderNode;
  depth: number;
  currentFolderId: number | null;
  onCreate: (parentId: number) => void;
  onRename: (folder: MediaFolder) => void;
  onDelete: (folder: MediaFolder) => void;
}) {
  const isActive = currentFolderId === node.id;
  const hasChildren = node.children.length > 0;

  // Folder open if it's active or any descendant is active.
  const containsActive = useMemo((): boolean => {
    const walk = (n: FolderNode): boolean => {
      if (currentFolderId === n.id) return true;
      return n.children.some(walk);
    };
    return node.children.some(walk);
  }, [node, currentFolderId]);

  const [open, setOpen] = useState<boolean>(isActive || containsActive);

  // Re-sync su cambio currentFolderId (es. navigazione tra folder)
  useEffect(() => {
    if (isActive || containsActive) setOpen(true);
  }, [isActive, containsActive]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const t = useTranslations("admin.content.media.tree");

  return (
    <li>
      <div
        className="flex items-center gap-1 group rounded"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: isActive ? "var(--admin-accent-soft, rgba(0,0,0,0.05))" : "transparent",
        }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-0.5"
          style={{
            color: "var(--admin-text-muted)",
            visibility: hasChildren ? "visible" : "hidden",
          }}
          aria-label={open ? t("collapse") : t("expand")}>
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <Link
          href={`/admin/content/media?folder=${node.id}`}
          className="flex-1 flex items-center gap-2 py-1 text-sm min-w-0"
          style={{
            color: isActive ? "var(--admin-accent)" : "var(--admin-text)",
            fontWeight: isActive ? 600 : 400,
          }}>
          {open || isActive ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
          ) : (
            <FolderClosed className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((v) => !v);
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: "var(--admin-text-muted)" }}
            aria-label={t("folderActions")}>
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-20 rounded-md shadow-lg py-1 min-w-[160px]"
              style={{
                background: "var(--admin-card-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <MenuItem
                label={t("newSubfolder")}
                onClick={() => {
                  setMenuOpen(false);
                  onCreate(node.id);
                }}
              />
              <MenuItem
                label={t("rename")}
                onClick={() => {
                  setMenuOpen(false);
                  onRename(node);
                }}
              />
              <MenuItem
                label={t("delete")}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(node);
                }}
                danger
              />
            </div>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <FolderNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
      style={{ color: danger ? "#dc2626" : "var(--admin-text)" }}>
      {label}
    </button>
  );
}

function CreateOrRenameDialog(
  props:
    | {
        mode: "create";
        parentId: number | null;
        onClose: () => void;
        onSuccess: (msg: string) => void;
        onError: (msg: string) => void;
      }
    | {
        mode: "rename";
        folder: MediaFolder;
        onClose: () => void;
        onSuccess: (msg: string) => void;
        onError: (msg: string) => void;
      },
) {
  const t = useTranslations("admin.content.media.tree.dialog");
  const inputRef = useRef<HTMLInputElement>(null);

  const action = props.mode === "create" ? createMediaFolder : renameMediaFolder;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if ("success" in state) props.onSuccess(state.success);
    else if ("error" in state) props.onError(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const initialName = props.mode === "rename" ? props.folder.name : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={props.onClose}>
      <div
        className="rounded-xl p-6 max-w-md w-full shadow-xl"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--admin-text)" }}>
          {props.mode === "create" ? t("createTitle") : t("renameTitle")}
        </h3>

        <form action={formAction} className="space-y-4">
          {props.mode === "create" ? (
            <input
              type="hidden"
              name="parentId"
              value={props.parentId ?? ""}
            />
          ) : (
            <input type="hidden" name="id" value={props.folder.id} />
          )}

          <div>
            <label
              className="block text-sm mb-1"
              style={{ color: "var(--admin-text)" }}>
              {t("nameLabel")}
            </label>
            <input
              ref={inputRef}
              type="text"
              name="name"
              defaultValue={initialName}
              required
              maxLength={100}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{
                background: "var(--admin-input-bg, var(--admin-card-bg))",
                border: "1px solid var(--admin-card-border)",
                color: "var(--admin-text)",
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={props.onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{
                borderColor: "var(--admin-card-border)",
                color: "var(--admin-text)",
              }}>
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2 disabled:opacity-60"
              style={{ background: "var(--admin-accent)" }}>
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteFolderDialog({
  folder,
  onClose,
  onSuccess,
  onError,
}: {
  folder: MediaFolder;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations("admin.content.media.tree.dialog");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    deleteMediaFolder,
    {},
  );

  useEffect(() => {
    if ("success" in state) onSuccess(state.success);
    else if ("error" in state) onError(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}>
      <div
        className="rounded-xl p-6 max-w-md w-full shadow-xl"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
        onClick={(e) => e.stopPropagation()}>
        <h3
          className="text-base font-semibold mb-2"
          style={{ color: "var(--admin-text)" }}>
          {t("deleteTitle")}
        </h3>
        <p className="text-sm mb-1" style={{ color: "var(--admin-text-muted)" }}>
          {t("deleteBody", { name: folder.name })}
        </p>
        <p className="text-sm mb-5" style={{ color: "var(--admin-text-muted)" }}>
          {t("deleteWarning")}
        </p>

        <form action={formAction} className="flex justify-end gap-2">
          <input type="hidden" name="id" value={folder.id} />
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium border"
            style={{
              borderColor: "var(--admin-card-border)",
              color: "var(--admin-text)",
            }}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 inline-flex items-center gap-2 disabled:opacity-60">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("deleteConfirm")}
          </button>
        </form>
      </div>
    </div>
  );
}
