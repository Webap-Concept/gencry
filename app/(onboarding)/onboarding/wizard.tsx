// app/(onboarding)/onboarding/wizard.tsx
//
// Wizard a 3 step:
//   0) Benvenuto + scelta username (con live availability check)
//   1) Scelta di almeno 3 cripto da una lista mock
//   2) Schermata "Tutto pronto" → completa onboarding e va in home

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, PartyPopper, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { checkUsernameAction } from "@/app/(login)/actions";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import {
  completeOnboarding,
  setOnboardingInterests,
  setOnboardingUsername,
} from "./actions";

// ---------------------------------------------------------------------------
// Lista crypto mock (da sostituire con API reale in seguito)
// ---------------------------------------------------------------------------

const CRYPTO_OPTIONS = [
  { id: "btc",   name: "Bitcoin",       symbol: "BTC",   color: "#f7931a" },
  { id: "eth",   name: "Ethereum",      symbol: "ETH",   color: "#627eea" },
  { id: "sol",   name: "Solana",        symbol: "SOL",   color: "#9945ff" },
  { id: "ada",   name: "Cardano",       symbol: "ADA",   color: "#0033ad" },
  { id: "xrp",   name: "XRP",           symbol: "XRP",   color: "#23292f" },
  { id: "doge",  name: "Dogecoin",      symbol: "DOGE",  color: "#c2a633" },
  { id: "dot",   name: "Polkadot",      symbol: "DOT",   color: "#e6007a" },
  { id: "matic", name: "Polygon",       symbol: "MATIC", color: "#8247e5" },
  { id: "link",  name: "Chainlink",     symbol: "LINK",  color: "#2a5ada" },
  { id: "avax",  name: "Avalanche",     symbol: "AVAX",  color: "#e84142" },
  { id: "atom",  name: "Cosmos",        symbol: "ATOM",  color: "#2e3148" },
  { id: "near",  name: "NEAR Protocol", symbol: "NEAR",  color: "#000000" },
];

const MIN_INTERESTS = 3;

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current
              ? "w-8 bg-brand-primary"
              : i < current
                ? "w-1.5 bg-brand-primary/60"
                : "w-1.5 bg-brand-border"
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function OnboardingWizard({
  initialStep,
  initialUsername,
  initialInterests,
}: {
  initialStep: 0 | 1 | 2;
  initialUsername: string;
  initialInterests: string[];
}) {
  const [step, setStep] = useState<0 | 1 | 2>(initialStep);

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          <StepDots current={step} total={3} />

          {step === 0 && (
            <UsernameStep
              initial={initialUsername}
              onDone={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <InterestsStep
              initial={initialInterests}
              onBack={() => setStep(0)}
              onDone={() => setStep(2)}
            />
          )}
          {step === 2 && <DoneStep />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 0 — Benvenuto + Username
// ---------------------------------------------------------------------------

function UsernameStep({
  initial,
  onDone,
}: {
  initial: string;
  onDone: () => void;
}) {
  const [username, setUsername]                 = useState(initial);
  const [available, setAvailable]               = useState<boolean>(Boolean(initial));
  const [checking, setChecking]                 = useState(false);
  const [validationError, setValidationError]   = useState("");
  const [submitError, setSubmitError]           = useState("");
  const [pending, startTransition]              = useTransition();

  // Request-id pattern: scarta i risultati delle chiamate stale (l'utente
  // ha già digitato altro). I server action non sono cancellabili via
  // AbortController, ma possiamo ignorare le loro risposte.
  const requestIdRef = useRef(0);

  // Live availability check (debounce 400ms)
  useEffect(() => {
    setSubmitError("");

    if (!username) {
      requestIdRef.current++;
      setValidationError("");
      setAvailable(false);
      setChecking(false);
      return;
    }
    if (username.length < 3 || username.length > 50) {
      requestIdRef.current++;
      setValidationError("Username tra 3 e 50 caratteri");
      setAvailable(false);
      setChecking(false);
      return;
    }
    const formatCheck = validateUsernameFormat(username);
    if (!formatCheck.ok) {
      requestIdRef.current++;
      setValidationError(formatCheck.error);
      setAvailable(false);
      setChecking(false);
      return;
    }
    setValidationError("");

    const handle = setTimeout(async () => {
      const myId = ++requestIdRef.current;
      setChecking(true);
      try {
        const res = await checkUsernameAction(username);
        if (requestIdRef.current !== myId) return;
        setAvailable(Boolean(res.available));
        setValidationError(res.error ?? "");
      } catch {
        if (requestIdRef.current !== myId) return;
        setValidationError("Impossibile verificare lo username");
        setAvailable(false);
      } finally {
        if (requestIdRef.current === myId) setChecking(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [username]);

  const canSubmit = available && !checking && !validationError && !pending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await setOnboardingUsername(username);
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-bg mb-3">
          <Sparkles className="h-6 w-6 text-brand-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-brand-text">Benvenuto!</h1>
        <p className="text-sm text-brand-text-muted mt-1">
          Iniziamo scegliendo il tuo username pubblico.
        </p>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="onb-username"
          className="text-xs font-semibold uppercase tracking-wide text-brand-label">
          Username
        </Label>
        <div className="relative">
          <Input
            id="onb-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="es. cripto_lover"
            autoComplete="off"
            autoFocus
            className="pr-10"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking && (
              <Loader2 className="h-4 w-4 animate-spin text-brand-text-muted" />
            )}
            {!checking && available && username.length >= 3 && (
              <Check className="h-4 w-4 text-emerald-500" />
            )}
            {!checking && validationError && (
              <X className="h-4 w-4 text-brand-destructive" />
            )}
          </div>
        </div>
        {validationError ? (
          <p className="text-xs text-brand-destructive">{validationError}</p>
        ) : (
          <p className="text-xs text-brand-text-muted">
            3-50 caratteri, lettere, numeri, punto (.) e underscore (_)
          </p>
        )}
      </div>

      {submitError && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
          <X className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full">
        {pending ? (
          <>
            <Loader2 className="animate-spin h-4 w-4" /> Salvataggio…
          </>
        ) : (
          "Continua"
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Interessi crypto (mock)
// ---------------------------------------------------------------------------

function InterestsStep({
  initial,
  onBack,
  onDone,
}: {
  initial: string[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [submitError, setSubmitError] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => {
    setSubmitError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = selected.size >= MIN_INTERESTS && !pending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await setOnboardingInterests(Array.from(selected));
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      onDone();
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-brand-text">
          Cosa ti interessa?
        </h1>
        <p className="text-sm text-brand-text-muted mt-1">
          Scegli almeno {MIN_INTERESTS} asset da seguire.
          Ne hai selezionati{" "}
          <span className="font-semibold text-brand-text">{selected.size}</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CRYPTO_OPTIONS.map((c) => {
          const isSelected = selected.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-left ${
                isSelected
                  ? "border-brand-primary bg-brand-primary/5 shadow-sm"
                  : "border-brand-border bg-brand-bg hover:border-brand-primary/40"
              }`}>
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: c.color }}>
                {c.symbol.slice(0, 3)}
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-brand-text">{c.name}</div>
                <div className="text-xs text-brand-text-muted">{c.symbol}</div>
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-brand-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {submitError && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
          <X className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={pending}
          className="flex-1">
          Indietro
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1">
          {pending ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" /> Salvataggio…
            </>
          ) : (
            "Continua"
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Done
// ---------------------------------------------------------------------------

function DoneStep() {
  const [pending, startTransition] = useTransition();

  const handleStart = () => {
    startTransition(async () => {
      await completeOnboarding();
      // completeOnboarding fa redirect server-side, qui non si arriva
    });
  };

  return (
    <div className="space-y-6 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
        <PartyPopper className="h-7 w-7 text-emerald-600" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-brand-text">Tutto pronto!</h1>
        <p className="text-sm text-brand-text-muted mt-2 max-w-sm mx-auto">
          Il tuo profilo è impostato. Ora puoi iniziare a esplorare l'app.
        </p>
      </div>
      <Button onClick={handleStart} disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="animate-spin h-4 w-4" /> Apro l'app…
          </>
        ) : (
          "Inizia"
        )}
      </Button>
    </div>
  );
}
