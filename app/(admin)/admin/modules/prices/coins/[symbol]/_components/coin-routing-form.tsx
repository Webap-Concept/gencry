"use client";
// app/(admin)/admin/modules/prices/coins/[symbol]/_components/coin-routing-form.tsx
//
// Form per impostare preferred_exchange + exchange_symbol del coin
// corrente. Renderizzato sotto la coin detail page admin.

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { adminFieldStyle } from "@/app/(admin)/admin/_components/admin-dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Route, XCircle } from "lucide-react";
import { updateCoinRoutingAction } from "../routing-actions";

type ExchangeOption = {
  id: string;
  label: string;
  enabled: boolean;
};

type Props = {
  symbol: string;
  initialPreferredExchange: string | null;
  initialExchangeSymbol: string | null;
  exchanges: ExchangeOption[];
};

export function CoinRoutingForm({
  symbol,
  initialPreferredExchange,
  initialExchangeSymbol,
  exchanges,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preferredExchange, setPreferredExchange] = useState<string>(
    initialPreferredExchange ?? "",
  );
  const [exchangeSymbol, setExchangeSymbol] = useState<string>(
    initialExchangeSymbol ?? "",
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty =
    (preferredExchange || "") !== (initialPreferredExchange || "") ||
    (exchangeSymbol || "") !== (initialExchangeSymbol || "");

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateCoinRoutingAction(
        symbol,
        preferredExchange || null,
        exchangeSymbol || null,
      );
      if (!res.ok) {
        setFeedback({ ok: false, msg: res.error });
      } else {
        setFeedback({ ok: true, msg: "Routing salvato." });
        router.refresh();
      }
    });
  }

  // Auto-suggest exchange_symbol quando l'admin sceglie un exchange:
  // pattern Binance "<SYM>USDT". Solo se il campo e' attualmente vuoto
  // o uguale al previous suggest, cosi' non sovrascriviamo input manuale.
  function handleExchangeChange(next: string) {
    const prevSuggest = preferredExchange
      ? `${symbol.toUpperCase()}USDT`
      : "";
    setPreferredExchange(next);
    if (next === "") {
      // Tornare a "no exchange" → svuota anche il symbol
      if (exchangeSymbol === prevSuggest || exchangeSymbol === "") {
        setExchangeSymbol("");
      }
      return;
    }
    if (!exchangeSymbol || exchangeSymbol === prevSuggest) {
      setExchangeSymbol(`${symbol.toUpperCase()}USDT`);
    }
  }

  return (
    <section
      className="rounded-xl p-5 space-y-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            color: "var(--admin-accent)",
          }}>
          <Route size={16} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            Exchange routing
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            Imposta da quale exchange viene fetchato il prezzo corrente
            di <strong>{symbol}</strong>. Se non specifichi nulla → fallback
            CoinGecko (path legacy).
          </p>
        </div>
      </header>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <label className="block">
          <span
            className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Preferred exchange
          </span>
          <select
            value={preferredExchange}
            onChange={(e) => handleExchangeChange(e.target.value)}
            disabled={pending}
            style={adminFieldStyle}>
            <option value="">— (fallback CoinGecko) —</option>
            {exchanges.map((ex) => (
              <option key={ex.id} value={ex.id} disabled={!ex.enabled}>
                {ex.label}
                {!ex.enabled ? " (disabilitato)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span
            className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Exchange symbol
          </span>
          <input
            type="text"
            value={exchangeSymbol}
            onChange={(e) => setExchangeSymbol(e.target.value.toUpperCase())}
            placeholder="es. BTCUSDT"
            disabled={pending || !preferredExchange}
            style={adminFieldStyle}
          />
          <span
            className="block text-[11px] mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            Formato dell&apos;exchange. Binance: <code>BTCUSDT</code>.
            KuCoin: <code>BTC-USDT</code>. Gate: <code>BTC_USDT</code>.
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          icon={pending ? Loader2 : Route}
          onClick={save}
          disabled={pending || !dirty}>
          {pending ? "Salvando…" : "Salva routing"}
        </AdminButton>
        {feedback && (
          <span
            className="inline-flex items-center gap-1.5 text-[12px]"
            style={{
              color: feedback.ok
                ? "var(--gc-pos, #10b981)"
                : "var(--gc-neg, #dc2626)",
            }}>
            {feedback.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {feedback.msg}
          </span>
        )}
      </div>
    </section>
  );
}
