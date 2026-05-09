"use client";

import type { AssetReference, MediaAsset, MediaFolder } from "@/lib/db/media-queries";
import { useEffect, useState, type ReactNode } from "react";
import { MediaGrid } from "./media-grid";
import {
  MediaToolbar,
  type SortBy,
  type SortDir,
  type ThumbSize,
} from "./media-toolbar";

const STORAGE_KEY = "media-lib-thumb-size";

function isThumbSize(v: unknown): v is ThumbSize {
  return v === "sm" || v === "md";
}

interface MediaShellProps {
  /** Slot per il breadcrumb server-rendered (layout flex con la toolbar). */
  breadcrumb: ReactNode;
  /** Slot per l'uploader server-rendered. */
  uploader: ReactNode;
  /** Slot per la pagination server-rendered (sotto la grid). */
  pagination: ReactNode;
  assets: MediaAsset[];
  folders: MediaFolder[];
  references: Record<string, AssetReference[]>;
  folderId: number | null;
  sort: SortBy;
  dir: SortDir;
}

export function MediaShell({
  breadcrumb,
  uploader,
  pagination,
  assets,
  folders,
  references,
  folderId,
  sort,
  dir,
}: MediaShellProps) {
  // Default `md` lato server per evitare flash di layout: il useEffect
  // sotto rilegge da localStorage al mount client e aggiorna se necessario.
  const [thumbSize, setThumbSize] = useState<ThumbSize>("md");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isThumbSize(raw)) setThumbSize(raw);
    } catch {
      // localStorage può throware in contesti private/incognito → no-op.
    }
  }, []);

  function handleThumbSizeChange(next: ThumbSize) {
    setThumbSize(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // no-op
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{breadcrumb}</div>
        <MediaToolbar
          folderId={folderId}
          sort={sort}
          dir={dir}
          thumbSize={thumbSize}
          onThumbSizeChange={handleThumbSizeChange}
        />
      </div>
      {uploader}
      <MediaGrid
        assets={assets}
        folders={folders}
        references={references}
        thumbSize={thumbSize}
      />
      {pagination}
    </div>
  );
}
