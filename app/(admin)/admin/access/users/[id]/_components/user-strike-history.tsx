"use client";
// app/(admin)/admin/access/users/[id]/_components/user-strike-history.tsx
//
// Timeline degli strike (attivi + revocati) di un utente. Visibile
// nella pagina detail. Per ogni strike attivo l'admin con permission
// `modules:posts.moderate` vede il bottone "Revoca". Il trigger DB
// `users_strikes_sync_count_trg` aggiorna automaticamente
// `users.active_strikes_count` e sollievevad il ban se count < 3.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertOctagon,
  Check,
  ExternalLink,
  RotateCcw,
  Shield,
} from "lucide-react";
import type { UserStrike } from "@/lib/db/schema";
import { revokeUserStrikeAction } from "../../actions";

function timeShort(d: Date | string): string {
  return new Date(d).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserStrikeHistory({
  strikes,
  canRevoke,
  reasonLabels,
}: {
  strikes: UserStrike[];
  canRevoke: boolean;
  reasonLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeNote, setRevokeNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeCount = strikes.filter((s) => !s.revokedAt).length;
  const banned = activeCount >= 3;

  const handleRevoke = (strikeId: string) => {
    setSubmitError(null);
    startTransition(async () => {
      const res = await revokeUserStrikeAction(
        strikeId,
        revokeNote.trim() || undefined,
      );
      if (res.ok) {
        setRevokingId(null);
        setRevokeNote("");
        router.refresh();
      } else {
        setSubmitError(res.error);
      }
    });
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-amber-600" />
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Strike di moderazione
          </h3>
        </div>
        <span
          className="text-xs font-semibold px-2 py-1 rounded"
          style={{
            background: banned
              ? "#dc2626"
              : activeCount > 0
                ? "#f59e0b22"
                : "var(--admin-hover-bg)",
            color: banned
              ? "#fff"
              : activeCount > 0
                ? "#b45309"
                : "var(--admin-text-muted)",
          }}>
          {banned
            ? "BAN 3/3"
            : `${activeCount}/3 attivi · ${strikes.length} totali`}
        </span>
      </header>

      {strikes.length === 0 ? (
        <p
          className="text-sm italic"
          style={{ color: "var(--admin-text-faint)" }}>
          Nessun strike emesso a questo utente.
        </p>
      ) : (
        <ul className="space-y-2">
          {strikes.map((s) => {
            const isActive = !s.revokedAt;
            const reasonLabel = reasonLabels[s.reason] ?? s.reason;
            const targetHref =
              s.sourceType === "post"
                ? `/post/${s.sourceId}`
                : `/post/${s.sourceId}`; // commento: il link va al post — la deep-link comment richiede postId, qui non lo abbiamo
            return (
              <li
                key={s.id}
                className="rounded-lg p-3"
                style={{
                  background: isActive
                    ? "color-mix(in srgb, #f59e0b 8%, var(--admin-page-bg))"
                    : "var(--admin-page-bg)",
                  border: `1px solid ${isActive ? "color-mix(in srgb, #f59e0b 30%, transparent)" : "var(--admin-card-border)"}`,
                  opacity: isActive ? 1 : 0.6,
                }}>
                <div className="flex items-start gap-2">
                  {isActive ? (
                    <AlertOctagon
                      size={16}
                      className="text-amber-600 mt-0.5 shrink-0"
                    />
                  ) : (
                    <Check
                      size={16}
                      className="text-emerald-600 mt-0.5 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--admin-text)" }}>
                        {reasonLabel}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: "var(--admin-hover-bg)",
                          color: "var(--admin-text-muted)",
                        }}>
                        {s.sourceType === "post" ? "POST" : "COMMENTO"}
                      </span>
                      <span
                        className="text-[11px] ml-auto"
                        style={{ color: "var(--admin-text-faint)" }}>
                        {timeShort(s.issuedAt)}
                      </span>
                    </div>
                    {s.sourcePreview ? (
                      <p
                        className="text-xs italic mt-1 line-clamp-2"
                        style={{ color: "var(--admin-text-muted)" }}>
                        &ldquo;{s.sourcePreview}&rdquo;
                        <Link
                          href={targetHref}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 inline-flex items-center gap-0.5 underline text-[11px]">
                          apri <ExternalLink size={9} />
                        </Link>
                      </p>
                    ) : null}
                    {s.note ? (
                      <p
                        className="text-xs mt-1 whitespace-pre-wrap"
                        style={{ color: "var(--admin-text)" }}>
                        Nota mod: {s.note}
                      </p>
                    ) : null}
                    {!isActive && s.revokedAt ? (
                      <p
                        className="text-[11px] italic mt-1"
                        style={{ color: "var(--admin-text-faint)" }}>
                        Revocato il {timeShort(s.revokedAt)}
                        {s.revokeNote ? ` — "${s.revokeNote}"` : ""}
                      </p>
                    ) : null}
                  </div>
                  {isActive && canRevoke ? (
                    <button
                      type="button"
                      onClick={() => setRevokingId(s.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
                      style={{
                        color: "var(--admin-accent)",
                        background:
                          "color-mix(in srgb, var(--admin-accent) 10%, transparent)",
                      }}>
                      <RotateCcw size={12} />
                      Revoca
                    </button>
                  ) : null}
                </div>
                {revokingId === s.id ? (
                  <div className="mt-2 pl-6 space-y-1.5">
                    <textarea
                      value={revokeNote}
                      onChange={(e) => setRevokeNote(e.target.value)}
                      placeholder="Motivo revoca (opzionale, audit)"
                      rows={2}
                      maxLength={2000}
                      className="w-full px-2 py-1.5 rounded text-xs"
                      style={{
                        background: "var(--admin-page-bg)",
                        border: "1px solid var(--admin-card-border)",
                        color: "var(--admin-text)",
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleRevoke(s.id)}
                        className="text-xs font-medium px-2 py-1 rounded text-white disabled:opacity-50"
                        style={{ background: "#dc2626" }}>
                        {pending ? "Revoco…" : "Conferma revoca"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRevokingId(null);
                          setRevokeNote("");
                        }}
                        className="text-xs px-2 py-1 rounded"
                        style={{
                          color: "var(--admin-text-muted)",
                          background: "var(--admin-hover-bg)",
                        }}>
                        Annulla
                      </button>
                    </div>
                    {submitError ? (
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--gc-neg, #dc2626)" }}>
                        Errore: {submitError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
