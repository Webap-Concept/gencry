"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Camera, Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/auth/middleware";
import { removeAvatar, updateProfile, uploadAvatar } from "../actions";

const TARGET_SIZE = 512;

type Initial = {
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  email: string;
};

export function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial.avatarUrl);

  // Update profile (firstName/lastName/username)
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
          <Field
            label="Nome"
            name="firstName"
            defaultValue={initial.firstName}
            required
            maxLength={100}
          />
          <Field
            label="Cognome"
            name="lastName"
            defaultValue={initial.lastName}
            required
            maxLength={100}
          />
        </div>

        <Field
          label="Username"
          name="username"
          defaultValue={initial.username}
          prefix="@"
          required
          maxLength={50}
          help="3–50 caratteri. Lettere, numeri e underscore."
        />

        <div>
          <label className="block text-[12.5px] font-medium text-gc-fg-2 mb-1.5">
            Email
          </label>
          <input
            type="text"
            value={initial.email}
            disabled
            className="w-full px-3 py-2.5 bg-gc-bg-3 border border-gc-line rounded-gc-sm text-[14px] text-gc-fg-3 cursor-not-allowed"
          />
          <p className="text-[11.5px] text-gc-fg-3 mt-1.5">
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
          <button
            type="submit"
            disabled={profilePending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-gc-accent text-white font-medium text-[14px] hover:brightness-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {profilePending ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  maxLength,
  prefix,
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  maxLength?: number;
  prefix?: string;
  help?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-[12.5px] font-medium text-gc-fg-2 mb-1.5"
      >
        {label}
      </label>
      <div className="flex items-center gap-2 bg-gc-bg-2 border border-gc-line rounded-gc-sm focus-within:border-gc-fg transition">
        {prefix && (
          <span className="pl-3 text-gc-fg-3 text-[14px]">{prefix}</span>
        )}
        <input
          id={name}
          name={name}
          type="text"
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          className="flex-1 bg-transparent px-3 py-2.5 text-[14px] text-gc-fg outline-none"
        />
      </div>
      {help && <p className="text-[11.5px] text-gc-fg-3 mt-1.5">{help}</p>}
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gc-line-2 text-[13px] font-medium text-gc-fg-2 hover:bg-gc-bg-2 hover:border-gc-fg transition disabled:opacity-60"
          >
            <Camera size={14} strokeWidth={1.7} />
            {uploading ? "Caricamento…" : avatarUrl ? "Cambia" : "Carica"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={triggerRemove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium text-gc-neg hover:bg-gc-bg-2 transition disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={1.7} />
              {removing ? "Rimozione…" : "Rimuovi"}
            </button>
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

/**
 * Carica l'immagine in un canvas, ritaglia centrato a quadrato e ridimensiona
 * a `size`x`size`. Esporta come JPEG (qualità 0.92). Non usa librerie esterne.
 */
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
