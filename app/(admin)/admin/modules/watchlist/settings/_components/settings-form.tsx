"use client";
// app/(admin)/admin/modules/watchlist/settings/_components/settings-form.tsx
//
// Form delle settings del modulo watchlist: cap watchlist per-utente
// (free/premium), cap coin per watchlist, TTL cache perf 30g. Testo
// hardcoded IT (uso staff interno, come social-graph). Stile input via
// `adminFieldStyle` standard. Pattern allineato a notifications.
//
// Nota cap premium: il valore e' gia' esposto ma il gating premium
// dipende dalla function PL/pgSQL get_user_watchlist_cap, che oggi
// ritorna sempre il free cap (vedi M_watchlist_001_init.sql). Quando
// arrivera' il modulo subscriptions, aggiornare quella function.
import { useActionState } from "react";
import { adminFieldStyle } from "@/app/(admin)/admin/_components/admin-dialog";
import { saveWatchlistSettings, type SettingsSaveResult } from "../actions";

const numberFieldStyle: React.CSSProperties = {
  ...adminFieldStyle,
  maxWidth: 220,
};

export type WatchlistSettingsInitial = {
  maxPerUserFree: number;
  maxPerUserPremium: number;
  maxCoinsPerWatchlist: number;
  perfCacheTtlSeconds: number;
};

export function WatchlistSettingsForm({
  initial,
}: {
  initial: WatchlistSettingsInitial;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsSaveResult | null,
    FormData
  >(saveWatchlistSettings, null);

  return (
    <form action={formAction} className="space-y-5 max-w-2xl">
      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[var(--admin-text)]">
            Limiti per utente
          </h2>
          <p className="text-sm text-[var(--admin-text-muted)] mt-0.5">
            Quante watchlist può avere un utente. Il cap effettivo è deciso
            dalla function DB get_user_watchlist_cap (oggi sempre free).
          </p>
        </header>

        <NumberField
          name="max_per_user_free"
          label="Max watchlist — free"
          help="Numero massimo di watchlist attive per un utente free. Default 5."
          defaultValue={initial.maxPerUserFree}
          min={1}
          max={100}
        />

        <NumberField
          name="max_per_user_premium"
          label="Max watchlist — premium"
          help="Cap per il tier premium (pronto al wiring quando arriveranno le subscription). Default 20."
          defaultValue={initial.maxPerUserPremium}
          min={1}
          max={500}
        />
      </section>

      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-[var(--admin-text)]">
            Coin e performance
          </h2>
        </header>

        <NumberField
          name="max_coins_per_watchlist"
          label="Max coin per watchlist"
          help="Numero massimo di coin in una singola watchlist (hard-stop a livello DB). Default 50."
          defaultValue={initial.maxCoinsPerWatchlist}
          min={1}
          max={1000}
        />

        <NumberField
          name="perf_cache_ttl_seconds"
          label="TTL cache perf 30g (secondi)"
          help="Durata della cache Redis per-coin della performance 30 giorni. Default 300 (5 min)."
          defaultValue={initial.perfCacheTtlSeconds}
          min={30}
          max={3600}
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-[var(--admin-accent)] text-white text-sm font-medium hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Salva
        </button>
        {state?.ok ? (
          <span className="text-xs text-emerald-600">Salvato</span>
        ) : null}
        {state?.ok === false ? (
          <span className="text-xs text-rose-600">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  help,
  defaultValue,
  min,
  max,
}: {
  name: string;
  label: string;
  help: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[var(--admin-text)] mb-1">
        {label}
      </span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        style={numberFieldStyle}
      />
      <span className="block text-xs text-[var(--admin-text-muted)] mt-1">
        {help}
      </span>
    </label>
  );
}
