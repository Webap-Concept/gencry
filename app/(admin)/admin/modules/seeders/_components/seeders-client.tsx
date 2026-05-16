"use client";
// app/(admin)/admin/modules/seeders/_components/seeders-client.tsx
//
// UI del pannello Seeders. Form parametrizzato per Run + bottone
// Cleanup. Tutte le mutation passano dalle Server Actions con
// requireAdminSectionPage("modules:seeders") gate.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sprout, Trash2 } from "lucide-react";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import {
  cleanupSeederAction,
  runSeederAction,
  type RunSeederResult,
} from "../actions";

export function SeedersClient({
  initialSeedUsersCount,
}: {
  initialSeedUsersCount: number;
}) {
  const router = useRouter();
  const [userCount, setUserCount] = useState(20);
  const [postsPerUser, setPostsPerUser] = useState(5);
  const [withImages, setWithImages] = useState(true);
  const [withBlocks, setWithBlocks] = useState(true);
  const [withReactions, setWithReactions] = useState(true);
  const [lastResult, setLastResult] = useState<RunSeederResult | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [isRunning, startRun] = useTransition();
  const [isCleaning, startCleanup] = useTransition();

  const onRun = () => {
    setLastResult(null);
    startRun(async () => {
      const res = await runSeederAction({
        userCount,
        postsPerUser,
        withImages,
        withBlocks,
        withReactions,
      });
      setLastResult(res);
      if (res.ok) router.refresh();
    });
  };

  const onCleanupConfirm = () => {
    setCleanupError(null);
    startCleanup(async () => {
      const res = await cleanupSeederAction();
      if (res.ok) {
        setConfirmCleanup(false);
        setLastResult(null);
        router.refresh();
      } else {
        setCleanupError(res.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Stato corrente */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <Sprout size={20} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              Stato corrente
            </h2>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              Demo users esistenti nel DB (email pattern seed-*).
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-3xl font-semibold tabular-nums"
              style={{ color: "var(--admin-text)" }}>
              {initialSeedUsersCount}
            </p>
            <p
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--admin-text-faint)" }}>
              seed users
            </p>
          </div>
        </div>
        {initialSeedUsersCount > 0 && (
          <div
            className="mt-4 pt-4 border-t flex items-center justify-end"
            style={{ borderColor: "var(--admin-card-border)" }}>
            <AdminButton
              variant="destructive"
              size="sm"
              icon={Trash2}
              onClick={() => setConfirmCleanup(true)}>
              Elimina tutti i seed users
            </AdminButton>
          </div>
        )}
      </section>

      {/* Form Run */}
      <section
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <header>
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Genera demo content
          </h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Crea N seed users con profilo completo (DiceBear avatar) e
            opzionalmente post + immagini + relazioni di block.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberField
            label="Quanti utenti"
            value={userCount}
            min={1}
            max={500}
            onChange={setUserCount}
            hint="max 500 per run"
          />
          <NumberField
            label="Post per utente"
            value={postsPerUser}
            min={0}
            max={50}
            onChange={setPostsPerUser}
            hint="0 = solo utenti, niente post"
          />
        </div>

        <div className="space-y-2">
          <CheckboxField
            label="Includi immagini nei post (Picsum)"
            description="Circa il 30% dei post avrà un'immagine random."
            checked={withImages}
            onChange={setWithImages}
          />
          <CheckboxField
            label="Crea reazioni sui post"
            description="Circa il 40% dei post riceve reazioni (mood-biased: bullish → 🚀, bearish → 🐻)."
            checked={withReactions}
            onChange={setWithReactions}
          />
          <CheckboxField
            label="Crea relazioni di block tra utenti"
            description="Circa 1 block ogni 20 utenti, per testare il filtering del feed."
            checked={withBlocks}
            onChange={setWithBlocks}
          />
        </div>

        <div
          className="rounded-lg p-3 text-xs flex items-start gap-2"
          style={{
            background: "color-mix(in srgb, var(--gc-warning-fg) 8%, transparent)",
            color: "var(--gc-warning-fg)",
          }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <strong>Run lungo</strong>: 100 utenti × 5 post + immagini ≈ 30s.
            La pagina resta in attesa fino a fine. Niente progress bar in v1.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <AdminButton
            variant="primary"
            size="md"
            icon={Sprout}
            loading={isRunning}
            onClick={onRun}>
            {isRunning ? "Sto seedando…" : "Run seeder"}
          </AdminButton>
        </div>

        {lastResult ? <ResultPanel result={lastResult} /> : null}
      </section>

      {/* Cleanup confirmation dialog */}
      <AdminDialog
        open={confirmCleanup}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmCleanup(false);
            setCleanupError(null);
          }
        }}>
        <AdminDialogContent
          icon={Trash2}
          size="md"
          title="Eliminare tutti i seed users?"
          description="Operazione irreversibile. Cancella in CASCADE: profili, post, media, reazioni, commenti, bookmark, segnalazioni, block."
          footer={
            <>
              <AdminDialogCancelButton
                onClick={() => setConfirmCleanup(false)}
                disabled={isCleaning}>
                Annulla
              </AdminDialogCancelButton>
              <AdminDialogConfirmButton
                variant="danger"
                icon={Trash2}
                loading={isCleaning}
                onClick={onCleanupConfirm}>
                Conferma eliminazione
              </AdminDialogConfirmButton>
            </>
          }>
          <div
            className="text-sm space-y-2"
            style={{ color: "var(--admin-text-muted)" }}>
            <p>
              Il filtro è lockdown: <code>email LIKE 'seed-%@seed.&lt;domain&gt;'</code>.
              Gli account reali non vengono toccati.
            </p>
            <p>
              Stai per eliminare <strong>{initialSeedUsersCount}</strong> seed users
              e tutto il loro contenuto associato.
            </p>
            {cleanupError ? (
              <p className="font-medium" style={{ color: "var(--gc-neg)" }}>
                Errore: {cleanupError}
              </p>
            ) : null}
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span
        className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
        style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 13,
          borderRadius: 8,
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text)",
          outline: "none",
        }}
      />
      {hint ? (
        <span
          className="block text-[11px] mt-1"
          style={{ color: "var(--admin-text-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function CheckboxField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors"
      style={{
        background: checked ? "color-mix(in srgb, var(--admin-accent) 8%, transparent)" : "transparent",
        border: `1px solid ${checked ? "color-mix(in srgb, var(--admin-accent) 25%, transparent)" : "var(--admin-card-border)"}`,
      }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 cursor-pointer"
        style={{ accentColor: "var(--admin-accent)" }}
      />
      <span className="flex-1 min-w-0">
        <span
          className="block text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {label}
        </span>
        {description ? (
          <span
            className="block text-xs mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function ResultPanel({ result }: { result: RunSeederResult }) {
  if (!result.ok) {
    return (
      <div
        className="rounded-lg p-3 text-sm"
        style={{
          background: "color-mix(in srgb, var(--gc-neg) 8%, transparent)",
          color: "var(--gc-neg)",
        }}>
        Errore: {result.error}
      </div>
    );
  }
  return (
    <div
      className="rounded-lg p-3 text-sm space-y-1"
      style={{
        background: "color-mix(in srgb, var(--gc-pos) 8%, transparent)",
        color: "var(--admin-text)",
      }}>
      <p className="font-medium" style={{ color: "var(--gc-pos)" }}>
        Seed completato.
      </p>
      <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
        Utenti creati: <strong>{result.counts.usersCreated}</strong> ·
        Post creati: <strong>{result.counts.postsCreated}</strong> ·
        Reazioni: <strong>{result.counts.reactionsCreated}</strong> ·
        Block: <strong>{result.counts.blocksCreated}</strong>
      </p>
    </div>
  );
}
