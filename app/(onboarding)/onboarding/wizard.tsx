// app/(onboarding)/onboarding/wizard.tsx
//
// Wizard multi-step:
//   - (opzionale) Step username — visibile solo se userProfile.username è vuoto
//     (caso OAuth signup, l'email/password l'ha già scelto in signup form)
//   - Step coin picker — 3..20 coin scelti da `prices_coins` (top 50 + search)
//   - Step risk profile + experience
//   - Step done — chiama completeOnboarding()
//
// La page (server) calcola lo step iniziale dal vero stato persisto e passa
// `hasUsername` per sapere se mostrare/nascondere lo step 0.

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  Loader2,
  PartyPopper,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { checkUsernameAction } from "@/app/(login)/actions";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import type { CoinOption } from "@/lib/modules/onboarding/queries";
import {
  completeOnboarding,
  searchCoinsAction,
  setOnboardingCoinPicks,
  setOnboardingRiskProfile,
  setOnboardingUsername,
} from "./actions";

const COIN_PICKS_MIN = 3;
const COIN_PICKS_MAX = 20;

const RISK_PROFILES = ["cauto", "moderato", "aggressivo", "degen"] as const;
const EXPERIENCE_KEYS = ["newbie", "1to3y", "over3y"] as const;

type RiskProfile = (typeof RISK_PROFILES)[number];
type Experience  = (typeof EXPERIENCE_KEYS)[number];

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
// Wizard root
// ---------------------------------------------------------------------------

export function OnboardingWizard({
  initialStep,
  hasUsername,
  initialUsername,
  initialCoinPicks,
  initialRisk,
  topCoins,
}: {
  initialStep: 0 | 1 | 2 | 3;
  hasUsername: boolean;
  initialUsername: string;
  initialCoinPicks: string[];
  initialRisk: { profile: RiskProfile; experience: Experience } | null;
  topCoins: CoinOption[];
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialStep);

  // Numero step nel progress dipende dalla presenza dello step username
  const totalSteps = hasUsername ? 3 : 4;
  // Mappa lo step logico (0..3) al dot visuale (0..totalSteps-1) saltando
  // lo step username quando non visibile
  const visualStep = hasUsername ? Math.max(0, step - 1) : step;

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          <StepDots current={visualStep} total={totalSteps} />

          {step === 0 && !hasUsername && (
            <UsernameStep
              initial={initialUsername}
              onDone={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <CoinPicksStep
              initialPicks={initialCoinPicks}
              topCoins={topCoins}
              canGoBack={!hasUsername}
              onBack={() => setStep(0)}
              onDone={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <RiskProfileStep
              initial={initialRisk}
              onBack={() => setStep(1)}
              onDone={() => setStep(3)}
            />
          )}
          {step === 3 && <DoneStep />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step username (solo OAuth — utente senza username)
// ---------------------------------------------------------------------------

function UsernameStep({
  initial,
  onDone,
}: {
  initial: string;
  onDone: () => void;
}) {
  const t = useTranslations("public.onboarding.username");
  const [username, setUsername]                 = useState(initial);
  const [available, setAvailable]               = useState<boolean>(Boolean(initial));
  const [checking, setChecking]                 = useState(false);
  const [validationError, setValidationError]   = useState("");
  const [submitError, setSubmitError]           = useState("");
  const [pending, startTransition]              = useTransition();

  const requestIdRef = useRef(0);

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
      setValidationError(t("lengthError"));
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
        setValidationError(t("checkFailed"));
        setAvailable(false);
      } finally {
        if (requestIdRef.current === myId) setChecking(false);
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [username, t]);

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
        <h1 className="text-2xl font-semibold text-brand-text">{t("title")}</h1>
        <p className="text-sm text-brand-text-muted mt-1">{t("subtitle")}</p>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="onb-username"
          className="text-xs font-semibold uppercase tracking-wide text-brand-label">
          {t("label")}
        </Label>
        <div className="relative">
          <Input
            id="onb-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("placeholder")}
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
          <p className="text-xs text-brand-text-muted">{t("hint")}</p>
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
            <Loader2 className="animate-spin h-4 w-4" /> {t("submitPending")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step coin picks (3..20 da prices_coins reali)
// ---------------------------------------------------------------------------

function CoinPicksStep({
  initialPicks,
  topCoins,
  canGoBack,
  onBack,
  onDone,
}: {
  initialPicks: string[];
  topCoins: CoinOption[];
  canGoBack: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("public.onboarding.coinPicks");
  const [selected, setSelected] = useState<string[]>(initialPicks);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CoinOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  // Debounce search 350ms; vuoto → restituisce topCoins
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      requestIdRef.current++;
      setSearchResults(null);
      setSearching(false);
      return;
    }
    const handle = setTimeout(async () => {
      const myId = ++requestIdRef.current;
      setSearching(true);
      try {
        const res = await searchCoinsAction(q);
        if (requestIdRef.current !== myId) return;
        setSearchResults(res);
      } finally {
        if (requestIdRef.current === myId) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  const visibleCoins = searchResults ?? topCoins;

  // Le coin selezionate ma fuori dalla lista visibile (es. selezionate via
  // search e ora la search box è vuota): le includiamo in cima per non far
  // sparire selezioni dell'utente.
  const visibleSet = useMemo(
    () => new Set(visibleCoins.map((c) => c.symbol)),
    [visibleCoins],
  );
  const orphanSelected = selected.filter((s) => !visibleSet.has(s));

  const toggle = (symbol: string) => {
    setSubmitError("");
    setSelected((prev) => {
      const idx = prev.indexOf(symbol);
      if (idx >= 0) {
        return prev.filter((s) => s !== symbol);
      }
      if (prev.length >= COIN_PICKS_MAX) {
        setSubmitError(t("maxReached", { max: COIN_PICKS_MAX }));
        return prev;
      }
      return [...prev, symbol];
    });
  };

  const canSubmit =
    selected.length >= COIN_PICKS_MIN &&
    selected.length <= COIN_PICKS_MAX &&
    !pending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await setOnboardingCoinPicks(selected);
      if (res.error) {
        setSubmitError(res.error);
        return;
      }
      onDone();
    });
  };

  const renderCoin = (c: CoinOption) => {
    const isSelected = selected.includes(c.symbol);
    return (
      <button
        key={c.symbol}
        type="button"
        onClick={() => toggle(c.symbol)}
        className={`relative flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
          isSelected
            ? "border-brand-primary bg-brand-primary/5 shadow-sm"
            : "border-brand-border bg-brand-bg hover:border-brand-primary/40"
        }`}>
        {/* Iniziali del symbol invece dell'immagine remota: le coin images
            del DB puntano oggi a CoinGecko e non vogliamo fetch esterni dal
            frontend pubblico. Quando il modulo prices farà self-host su R2
            (PR-4), restituiremo `<Image>` con `c.imageUrl` interno. */}
        <div className="h-9 w-9 rounded-full bg-brand-surface flex items-center justify-center overflow-hidden shrink-0">
          <span className="text-xs font-bold text-brand-text-muted">
            {c.symbol.slice(0, 3)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-brand-text truncate">
            {c.name}
          </div>
          <div className="text-xs text-brand-text-muted">{c.symbol}</div>
        </div>
        {isSelected && (
          <div className="h-5 w-5 rounded-full bg-brand-primary flex items-center justify-center shrink-0">
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-brand-text">{t("title")}</h1>
        <p className="text-sm text-brand-text-muted mt-1">
          {t("subtitle", { min: COIN_PICKS_MIN, max: COIN_PICKS_MAX })}{" "}
          <span className="font-semibold text-brand-text">
            ({selected.length})
          </span>
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-text-muted" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9 pr-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-brand-text-muted" />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
        {orphanSelected.length > 0 && (
          <>
            {orphanSelected.map((symbol) =>
              renderCoin({ symbol, name: symbol, imageUrl: null }),
            )}
            <div className="col-span-full border-t border-brand-border my-1" />
          </>
        )}
        {visibleCoins.map((c) => renderCoin(c))}
        {visibleCoins.length === 0 && !searching && (
          <p className="col-span-full text-center text-sm text-brand-text-muted py-8">
            {t("noResults")}
          </p>
        )}
      </div>

      {submitError && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
          <X className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex gap-3">
        {canGoBack && (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={pending}
            className="flex-1">
            {t("back")}
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1">
          {pending ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" /> {t("submitPending")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step risk profile + experience
// ---------------------------------------------------------------------------

function RiskProfileStep({
  initial,
  onBack,
  onDone,
}: {
  initial: { profile: RiskProfile; experience: Experience } | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("public.onboarding.riskProfile");
  const [profile, setProfile] = useState<RiskProfile | null>(
    initial?.profile ?? null,
  );
  const [experience, setExperience] = useState<Experience | null>(
    initial?.experience ?? null,
  );
  const [submitError, setSubmitError] = useState("");
  const [pending, startTransition] = useTransition();

  const canSubmit = profile && experience && !pending;

  const handleSubmit = () => {
    if (!profile || !experience) return;
    startTransition(async () => {
      const res = await setOnboardingRiskProfile(profile, experience);
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
        <h1 className="text-2xl font-semibold text-brand-text">{t("title")}</h1>
        <p className="text-sm text-brand-text-muted mt-1">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-brand-label">
          {t("profileLabel")}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {RISK_PROFILES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setSubmitError("");
                setProfile(p);
              }}
              className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                profile === p
                  ? "border-brand-primary bg-brand-primary/5 text-brand-text shadow-sm"
                  : "border-brand-border bg-brand-bg text-brand-text-muted hover:border-brand-primary/40"
              }`}>
              {t(`profileOption.${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-brand-label">
          {t("experienceLabel")}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {EXPERIENCE_KEYS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setSubmitError("");
                setExperience(e);
              }}
              className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                experience === e
                  ? "border-brand-primary bg-brand-primary/5 text-brand-text shadow-sm"
                  : "border-brand-border bg-brand-bg text-brand-text-muted hover:border-brand-primary/40"
              }`}>
              {t(`experienceOption.${e}`)}
            </button>
          ))}
        </div>
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
          {t("back")}
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1">
          {pending ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" /> {t("submitPending")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step done
// ---------------------------------------------------------------------------

function DoneStep() {
  const t = useTranslations("public.onboarding.done");
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
        <h1 className="text-2xl font-semibold text-brand-text">{t("title")}</h1>
        <p className="text-sm text-brand-text-muted mt-2 max-w-sm mx-auto">
          {t("subtitle")}
        </p>
      </div>
      <Button onClick={handleStart} disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="animate-spin h-4 w-4" /> {t("submitPending")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
    </div>
  );
}
