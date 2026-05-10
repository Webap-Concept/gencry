// Layout utilities for the admin dashboard grid.
//
// Pure functions, no DB / no React. Used both at write time (server
// action sanitization, before persisting) and at read time (resolver,
// to auto-correct historic data that was saved with overlapping items
// before the compaction step landed).

import { GRID_COLS, type WidgetItem } from "./types";

/** Two grid items collide when their bounding boxes intersect on
 *  both axes. */
function collides(a: WidgetItem, b: WidgetItem): boolean {
  if (a.id === b.id) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Vertical compaction: place items as high (low y) as possible without
 * overlap, preserving their relative order. Mirrors the algorithm
 * react-grid-layout uses with compactType="vertical", but as a
 * standalone pure function we can call from server code.
 *
 * The output array is in the same item order the input came in, but
 * each item's `y` may be reduced. `x` and `w` are NOT modified — the
 * caller is responsible for clamping `x + w <= cols` first if needed.
 */
export function compactItemsVertical(
  input: ReadonlyArray<WidgetItem>,
  cols: number = GRID_COLS,
): WidgetItem[] {
  void cols; // reserved for horizontal-aware variants; kept for API symmetry
  // Sort a *copy* by (y, x) so we place top-left first; the original
  // input order is restored at the end so callers don't see a reorder.
  const indexed = input.map((it, i) => ({ it, i }));
  indexed.sort((a, b) => a.it.y - b.it.y || a.it.x - b.it.x);

  const placed: WidgetItem[] = [];
  for (const { it } of indexed) {
    let y = 0;
    // Walk down until we find a y where this item doesn't collide with
    // anything already placed. Bounded by an arbitrary cap to avoid an
    // infinite loop on pathological input — 1000 rows is plenty.
    for (; y < 1000; y++) {
      const candidate: WidgetItem = { ...it, y };
      if (!placed.some((p) => collides(candidate, p))) break;
    }
    placed.push({ ...it, y });
  }

  // Restore the input order so the persisted array stays stable.
  const byId = new Map(placed.map((p) => [p.id, p]));
  return input.map((it) => byId.get(it.id) ?? it);
}

/** Clamp every item to the grid (x + w <= cols, w <= cols, w >= 1).
 *  Run before compaction so collision math doesn't see out-of-grid items. */
export function clampItemsToGrid(
  input: ReadonlyArray<WidgetItem>,
  cols: number = GRID_COLS,
): WidgetItem[] {
  return input.map((it) => {
    const w = Math.max(1, Math.min(it.w, cols));
    const x = Math.max(0, Math.min(it.x, cols - w));
    const h = Math.max(1, it.h);
    const y = Math.max(0, it.y);
    return { id: it.id, x, y, w, h };
  });
}

/** Convenience: clamp + compact in one call. */
export function normalizeLayout(
  input: ReadonlyArray<WidgetItem>,
  cols: number = GRID_COLS,
): WidgetItem[] {
  return compactItemsVertical(clampItemsToGrid(input, cols), cols);
}
