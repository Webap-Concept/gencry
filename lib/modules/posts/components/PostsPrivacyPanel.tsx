"use client";
// lib/modules/posts/components/PostsPrivacyPanel.tsx
//
// Pannello "Post" dentro /settings/privacy. Permette di scegliere la
// `default_visibility` per i NUOVI post (sticky cross-device).
//
// Pattern radio list con optimistic update: click sull'opzione →
// stato locale aggiornato immediatamente + Server Action in background.
// Se l'action fallisce → rollback + error message inline.

import * as React from "react";
import { useTranslations } from "next-intl";
import { Globe, Users, UserCheck, Lock, Loader2, Check } from "lucide-react";
import { POST_VISIBILITIES, type PostVisibility } from "@/lib/db/schema";
import { setMyDefaultPostVisibility } from "@/lib/modules/posts/preferences-actions";

const VISIBILITY_ICON: Record<PostVisibility, typeof Globe> = {
  public: Globe,
  members: Users,
  followers: UserCheck,
  private: Lock,
};

type Props = {
  initialDefaultVisibility: PostVisibility;
};

export function PostsPrivacyPanel({ initialDefaultVisibility }: Props) {
  const tVis = useTranslations("posts.visibility");
  const tPanel = useTranslations("core.settings.privacy.posts");
  const [current, setCurrent] = React.useState<PostVisibility>(
    initialDefaultVisibility,
  );
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const handleSelect = (v: PostVisibility) => {
    if (v === current) return;
    const prev = current;
    setCurrent(v);
    setError(null);
    startTransition(async () => {
      const res = await setMyDefaultPostVisibility(v);
      if (!res.ok) {
        setCurrent(prev);
        setError(tPanel("saveError"));
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-gc-fg-3">{tPanel("description")}</p>

      <ul className="space-y-2">
        {POST_VISIBILITIES.map((v) => {
          const Icon = VISIBILITY_ICON[v];
          const active = v === current;
          return (
            <li key={v}>
              <button
                type="button"
                onClick={() => handleSelect(v)}
                disabled={pending && !active}
                aria-pressed={active}
                className={
                  "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors " +
                  (active
                    ? "border-gc-accent bg-gc-accent/5"
                    : "border-gc-line bg-gc-bg-2 hover:bg-gc-bg-3/60")
                }
              >
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  className={active ? "text-gc-accent mt-0.5" : "text-gc-fg-muted mt-0.5"}
                  aria-hidden
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-gc-fg">
                    {tVis(`${v}_label`)}
                  </span>
                  <span className="block text-[12px] text-gc-fg-3 mt-0.5">
                    {tVis(`${v}_description`)}
                  </span>
                </span>
                <span className="shrink-0 flex items-center justify-center w-5 h-5">
                  {pending && active ? (
                    <Loader2
                      size={14}
                      className="animate-spin text-gc-accent"
                      aria-hidden
                    />
                  ) : active ? (
                    <Check size={14} className="text-gc-accent" aria-hidden />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="text-[12.5px] text-gc-neg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
