// lib/db/errors.ts
//
// Small helpers to recognise common Postgres error shapes so callers can
// degrade gracefully (e.g. the admin Sessions page should still render
// even if a feature's table hasn't been migrated yet).
//
// drizzle wraps the underlying `postgres` error in its own thrown object;
// the original SQLSTATE lives on `.cause`. We accept both shapes.

type PgErrorLike = {
  code?: string;
  message?: string;
  cause?: PgErrorLike;
};

/** PG SQLSTATE 42P01 — undefined table. */
export function isUndefinedTableError(
  err: unknown,
  tableHint?: string,
): boolean {
  return matches(err, "42P01", tableHint);
}

/** PG SQLSTATE 42703 — undefined column. */
export function isUndefinedColumnError(
  err: unknown,
  columnHint?: string,
): boolean {
  return matches(err, "42703", columnHint);
}

function matches(err: unknown, code: string, hint: string | undefined): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as PgErrorLike;
  const seen = new Set<PgErrorLike>();
  let cur: PgErrorLike | undefined = e;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur.code === code) {
      if (!hint) return true;
      return (cur.message ?? "").includes(hint);
    }
    cur = cur.cause;
  }
  // Last resort: stringify and look at the message — drizzle sometimes
  // surfaces the SQLSTATE inline without a structured field.
  const msg = (e.message ?? "").toLowerCase();
  if (!msg) return false;
  if (code === "42P01" && msg.includes("does not exist") && hint) {
    return msg.includes(hint.toLowerCase());
  }
  return false;
}
