"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Camera, Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { checkUsernameAction } from "@/app/(login)/actions";
import { removeAvatar, updateProfile, uploadAvatar } from "../actions";

const TARGET_SIZE = 512;
const BIO_MAX = 160;

type UsernameCheckState = "idle" | "checking" | "available" | "taken";

type Initial = {
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  bio: string;
};

export function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial.avatarUrl);

  // Username availability real-time check
  const [usernameValue, setUsernameValue] = useState(initial.username);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = usernameValue.trim();

    // No check needed if empty or same as current username (case-insensitive)
    if (!trimmed || trimmed.toLowerCase() === initial.username.toLowerCase()) {
      setUsernameCheck("idle");
      return;
    }

    setUsernameCheck("checking");
    debounceRef.current = setTimeout(async () => {
      const result = await checkUsernameAction(trimmed);
      setUsernameCheck(result.available ? "available" : "taken");
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [usernameValue, initial.username]);

  const [profileState, profileAction, profilePending] = useActionState<
    ActionState,
    FormData
  >(updateProfile, {});

  useEffect(() => {
    if (profileState.success) {
      mutate("/api/user");
      router.refresh();
    }
  }, [profileState.success, router]);

  return (
    <div className="space-y-8">
      <AvatarSection
        avatarUrl={previewUrl}
        onUploaded={(url) => {
          setPreviewUrl(url);
          mutate("/api/user");
          router.refresh();
        }}
        onRemoved={() => {
          setPreviewUrl(null);
          mutate("/api/user");
          router.refresh();
        }}
      />

      <form action={profileAction} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome" name="firstName" defaultValue={initial.firstName} maxLength={100} />
          <Field label="Cognome" name="lastName" defaultValue={initial.lastName} maxLength={100} />
        </div>

        {/* Username — controlled per real-time check */}
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <Input
              id="username"
              name="username"
              type="text"
              value={usernameValue}
              onChange={(e) => setUsernameValue(e.target.value)}
              maxLength={50}
              className="pr-9"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              {usernameCheck === "checking" && (
                <Loader2 size={13} className="animate-spin text-gc-fg-3" />
              )}
              {usernameCheck === "available" && (
                <Check size={13} className="text-emerald-600" />
              )}
              {usernameCheck === "taken" && (
                <X size={13} className="text-gc-neg" />
              )}
            </span>
          </div>
          {usernameCheck === "taken" ? (
            <p className="text-[11.5px] text-gc-neg px-1">Username già in uso.</p>
          ) : (
            <p className="text-[11.5px] text-gc-fg-3 px-1">
              Verrà mostrato come @{usernameValue || "tuonome"}. 3–50 caratteri, lettere/numeri/underscore.
            </p>
          )}
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={initial.bio}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="Breve descrizione di te…"
            className="flex w-full rounded-2xl border px-4 py-2.5 text-sm resize-none bg-brand-surface-card text-brand-text placeholder:text-brand-text-light border-brand-border outline-none transition-colors focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-border-focus-rgb),0.2)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-[11.5px] text-gc-fg-3 px-1">Massimo {BIO_MAX} caratteri.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email-readonly">Email</Label>
          <Input
            id="email-readonly"
            type="email"
            value={initial.email}
            disabled
            readOnly
          />
          <p className="text-[11.5px] text-gc-fg-3 px-1">
            Il cambio email sarà disponibile dalla sezione Account.
          </p>
        </div>

        {profileState.error && (
          <p className="text-[13px] text-gc-neg">{profileState.error}</p>
        )}
        {profileState.success && (
          <p className="text-[13px] text-emerald-700">{profileState.success}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={profilePending}>
            {profilePending ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="text"
        defaultValue={defaultValue}
        maxLength={maxLength}
      />
    </div>
  );
}

function AvatarSection({
  avatarUrl,
  onUploaded,
  onRemoved,
}: {
  avatarUrl: string | null;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Seleziona un file immagine.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Immagine troppo grande. Massimo 8 MB.");
      return;
    }

    let resized: File;
    try {
      resized = await resizeToSquare(file, TARGET_SIZE);
    } catch (err) {
      console.error(err);
      setError("Impossibile leggere l'immagine. Riprova.");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", resized);

    startUpload(async () => {
      const result = await uploadAvatar({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) onUploaded(result.url);
    });
  }

  function triggerRemove() {
    setError(null);
    startRemove(async () => {
      const result = await removeAvatar({}, new FormData());
      if (result.error) {
        setError(result.error);
        return;
      }
      onRemoved();
    });
  }

  const busy = uploading || removing;

  return (
    <section className="flex items-center gap-5">
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Foto profilo"
            width={88}
            height={88}
            className="rounded-full object-cover border border-gc-line"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-[88px] h-[88px] rounded-full bg-gc-bg-3 border border-gc-line flex items-center justify-center text-gc-fg-3">
            <Camera size={26} strokeWidth={1.4} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-gc-fg">Foto profilo</div>
        <p className="text-[12px] text-gc-fg-3 mt-0.5">
          PNG, JPG o WebP. Verrà ridimensionata a {TARGET_SIZE}×{TARGET_SIZE}.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Camera size={14} strokeWidth={1.7} />
            {uploading ? "Caricamento…" : avatarUrl ? "Cambia" : "Carica"}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={triggerRemove}
              disabled={busy}
              className="text-gc-neg hover:text-gc-neg"
            >
              <Trash2 size={14} strokeWidth={1.7} />
              {removing ? "Rimozione…" : "Rimuovi"}
            </Button>
          )}
        </div>
        {error && <p className="text-[12.5px] text-gc-neg mt-2">{error}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}

async function resizeToSquare(file: File, size: number): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("img-load"));
    i.src = dataUrl;
  });

  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-ctx");
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("no-blob");
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}
