"use client";

import type { BannerServicesByCategory } from "@/lib/db/cookie-services-queries";
import { Cookie, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { GcModal, GcModalContent } from "@/components/ui/gc-modal";
import {
  acceptAllCookiesAction,
  rejectAllCookiesAction,
  saveCustomCookiesAction,
} from "./actions";

/**
 * Modale "Personalizza preferenze cookie" — usata sia dal banner pubblico
 * (visitatore che decide la prima volta) sia dai trigger di modifica
 * (footer pubblico, /settings/privacy) per chi ha già scelto.
 *
 * Riceve `initialPrefs` per pre-compilare i toggle in caso di modifica.
 * Default → tutti false (caso "prima decisione").
 */

export type CustomizeInitialPrefs = {
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

const DEFAULT_INITIAL: CustomizeInitialPrefs = {
  preferences: false,
  analytics: false,
  marketing: false,
};

type CategoryKey = "necessary" | "preferences" | "analytics" | "marketing";

const CATEGORY_KEYS: { key: CategoryKey; locked: boolean }[] = [
  { key: "necessary", locked: true },
  { key: "preferences", locked: false },
  { key: "analytics", locked: false },
  { key: "marketing", locked: false },
];

export function CookieCustomizeModal({
  initialPrefs = DEFAULT_INITIAL,
  policyUrl,
  services,
  onClose,
}: {
  initialPrefs?: CustomizeInitialPrefs;
  policyUrl?: string | null;
  /** Servizi attivi raggruppati per categoria, prefetched dal RootLayout. */
  services?: BannerServicesByCategory;
  onClose: () => void;
}) {
  const t = useTranslations("public.cookieModal");
  const [isPending, startTransition] = useTransition();
  const [preferences, setPreferences] = useState(initialPrefs.preferences);
  const [analytics, setAnalytics] = useState(initialPrefs.analytics);
  const [marketing, setMarketing] = useState(initialPrefs.marketing);

  // Le callback sono `async` con `await`: senza, startTransition
  // considera il transition completato sincronicamente e il router
  // resta in stato pending per sempre dopo che la Server Action ritorna,
  // bloccando ogni navigazione successiva (sintomo: i tab di /settings
  // non cambiano, /admin non si apre fino a hard refresh).
  const handleAcceptAll = () =>
    startTransition(async () => {
      await acceptAllCookiesAction();
    });

  const handleRejectAll = () =>
    startTransition(async () => {
      await rejectAllCookiesAction();
    });

  const handleSaveCustom = () => {
    const fd = new FormData();
    if (preferences) fd.set("preferences", "on");
    if (analytics) fd.set("analytics", "on");
    if (marketing) fd.set("marketing", "on");
    startTransition(async () => {
      await saveCustomCookiesAction(fd);
    });
  };

  const stateFor = (key: CategoryKey): boolean => {
    if (key === "necessary") return true;
    if (key === "preferences") return preferences;
    if (key === "analytics") return analytics;
    return marketing;
  };

  const setterFor = (key: CategoryKey): ((v: boolean) => void) => {
    if (key === "preferences") return setPreferences;
    if (key === "analytics") return setAnalytics;
    if (key === "marketing") return setMarketing;
    return () => {};
  };

  return (
    <GcModal open onOpenChange={(o) => { if (!o) onClose(); }}>
      <GcModalContent
        icon={Cookie}
        iconTone="info"
        title={t("title")}
        description={
          <>
            {t("intro")}
            {policyUrl && (
              <>
                {" "}
                <a
                  href={policyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline text-gc-warning-fg">
                  {t("policyLink")}
                  <ExternalLink size={11} />
                </a>
              </>
            )}
          </>
        }
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRejectAll}
              disabled={isPending}>
              {t("rejectAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveCustom}
              disabled={isPending}>
              {isPending ? t("savingPending") : t("saveSelection")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAcceptAll}
              disabled={isPending}>
              {t("acceptAll")}
            </Button>
          </>
        }
      >
        <ul className="space-y-3">
              {CATEGORY_KEYS.map(({ key, locked }) => {
                const checked = stateFor(key);
                const setChecked = setterFor(key);
                const catServices = services?.[key] ?? [];
                return (
                  <li
                    key={key}
                    className="rounded-lg p-3 bg-gc-bg-3 border border-gc-line">
                    <div className="flex items-start gap-3">
                      <input
                        id={`cookie-cat-${key}`}
                        type="checkbox"
                        checked={checked}
                        disabled={locked || isPending}
                        onChange={(e) => setChecked(e.target.checked)}
                        className="mt-0.5 w-4 h-4 cursor-pointer accent-gc-accent"
                        style={
                          locked
                            ? { cursor: "not-allowed", opacity: 0.7 }
                            : undefined
                        }
                      />
                      <label
                        htmlFor={`cookie-cat-${key}`}
                        className="flex-1 min-w-0 cursor-pointer"
                        style={locked ? { cursor: "not-allowed" } : undefined}>
                        <div className="text-sm font-medium text-gc-fg">
                          {t(`categories.${key}.label`)}
                          {locked && (
                            <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-gc-line text-gc-fg-2">
                              {t("alwaysActive")}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] mt-0.5 text-gc-fg-3">
                          {t(`categories.${key}.description`)}
                        </div>
                      </label>
                    </div>

                    {/* Lista servizi sotto la categoria — vuota se nessun
                        tracker dichiarato in admin per questa categoria. */}
                    {catServices.length > 0 && (
                      <ul className="mt-3 ml-7 space-y-1.5">
                        {catServices.map((s) => (
                          <li
                            key={s.id}
                            className="text-[11.5px] text-gc-fg-2">
                            <span className="font-medium text-gc-fg">
                              {s.name}
                            </span>
                            {s.description && (
                              <>
                                {" — "}
                                <span>{s.description}</span>
                              </>
                            )}
                            {s.providerPolicyUrl && (
                              <>
                                {" "}
                                <a
                                  href={s.providerPolicyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 underline text-gc-warning-fg">
                                  {t("servicePolicyLink")}
                                  <ExternalLink size={9} />
                                </a>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
        </ul>
      </GcModalContent>
    </GcModal>
  );
}
