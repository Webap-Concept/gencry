"use client";
// components/modules/posts/Composer.tsx
//
// Form per creare un nuovo post. Niente media in v1 (arriverà con PR-6).
//
// Pattern: useTransition + Server Action createPost + router.refresh()
// per ri-renderizzare RSC e far comparire il post nel feed. Niente
// scroll a top — il nuovo post compare in cima al feed naturalmente per
// l'ordine cronologico inverso.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPost } from "@/lib/modules/posts/actions";
import { POST_VISIBILITIES, type PostVisibility } from "@/lib/db/schema";

const VISIBILITY_LABEL: Record<PostVisibility, string> = {
  public: "Tutti",
  members: "Community",
  followers: "Chi mi segue",
  private: "Solo io",
};

type Props = {
  /** Soglia caratteri letta dalle settings; default safe = 2000. */
  maxBodyLength?: number;
};

export function Composer({ maxBodyLength = 2000 }: Props) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const remaining = maxBodyLength - body.length;
  const trimmedLen = body.trim().length;
  const canSubmit = trimmedLen > 0 && remaining >= 0 && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await createPost({ body, visibility });
      if (res.ok) {
        setBody("");
        setVisibility("public");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="bg-gc-bg-2 border border-gc-line rounded-gc p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Cosa pensi del mercato?"
        rows={3}
        maxLength={maxBodyLength + 100} // slack visivo, validazione vera lato server
        className="w-full bg-transparent text-gc-fg placeholder:text-gc-fg-muted resize-y outline-none text-[15px]"
        aria-label="Testo del post"
        disabled={isPending}
      />
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <label className="text-xs text-gc-fg-muted">
          Visibile a
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PostVisibility)}
            disabled={isPending}
            className="ml-2 bg-gc-bg-1 border border-gc-line rounded-gc-sm px-2 py-1 text-gc-fg"
          >
            {POST_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <span
          className={`text-xs ${remaining < 0 ? "text-gc-danger" : "text-gc-fg-muted"}`}
        >
          {remaining}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-1.5 rounded-full bg-gc-accent text-gc-bg-1 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "Pubblico…" : "Pubblica"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-gc-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
