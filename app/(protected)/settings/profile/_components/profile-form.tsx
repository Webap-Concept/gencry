"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Camera, Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import { checkUsernameAction } from "@/app/(login)/actions";
import { removeAvatar, updateProfile, uploadAvatar, type UploadAvatarState } from "../actions";
import { AvatarCropDialog } from "./avatar-crop-dialog";

const BIO_MAX = 160;

type Initial = {
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  email: string;
  bio: string;
  /** Locale preferito (es. "it", "en"). Stringa vuota = nessuna preferenza. */
  locale: string;
};

type LocaleOption = { code: string; nativeLabel: string };

export function ProfileForm({
  initial,
  locales,
}: {
  initial: Initial;
  locales: LocaleOption[];
}) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial.avatarUrl);

  // Username availability real-time check (stesso pattern di /sign-up)
  const [usernameValue, setUsernameValue] = useState(initial.username);
  const [usernameError, setUsernameError] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = usernameValue.trim();

    // Stesso valore corrente (case-insensitive) → nessun feedback
    if (trimmed.toLowerCase() === initial.username.toLowerCase()) {
      setUsernameError("");
      setUsernameAvailable(false);
      setCheckingUsername(false);
      return;
    }

    if (!trimmed) {
      setUsernameError("");
      setUsernameAvailable(false);
      setCheckingUsername(false);
      return;
    }

    if (trimmed.length < 3) {
      setUsernameError("Minimo 3 caratteri");
      setUsernameAvailable(false);
      setCheckingUsername(false);
      return;
    }

    const formatCheck = validateUsernameFormat(trimmed);
    if (!formatCheck.ok) {
      setUsernameError(formatCheck.error);
      setUsernameAvailable(false);
      setCheckingUsername(false);
      return;
    }

    setCheckingUsername(true);
    setUsernameError("");
    setUsernameAvailable(false);

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkUsernameAction(trimmed);
        // result.error: blacklist ("Questo username non è disponibile.")
        // result.available === false (no error): già registrato
        // result.available === true: ok
        setUsernameError(
          result.error ?? (result.available ? "" : "Username già in uso"),
        );
        setUsernameAvailable(Boolean(result.available));
      } catch {
        setUsernameError("Impossibile verificare lo username in questo momento");
        setUsernameAvailable(false);
      } finally {
        setCheckingUsername(false);
      }
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

        {/* Username — controlled, real-time check (stesso pattern di /sign-up) */}
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            type="text"
            value={usernameValue}
            onChange={(e) => setUsernameValue(e.target.value)}
            maxLength={50}
            aria-invalid={!!usernameError}
          />
          {checkingUsername ? (
            <p className="text-[11.5px] flex items-center gap-1 text-gc-fg-3 px-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Verifica username in corso…
            </p>
          ) : usernameError ? (
            <p className="text-[11.5px] flex items-center gap-1 text-gc-neg px-1">
              <X className="h-3 w-3" /> {usernameError}
            </p>
          ) : usernameAvailable ? (
            <p className="text-[11.5px] flex items-center gap-1 text-gc-success-fg px-1">
              <Check className="h-3 w-3" /> Username disponibile
            </p>
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
            className="flex w-full rounded-2xl border px-4 py-2.5 text-sm resize-none bg-brand-surface-card text-brand-text placeholder:text-brand-text-light border-brand-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-border-focus-rgb),0.2)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* Lingua preferita: salva users.locale + sync cookie NEXT_LOCALE.
            Le lingue mostrate sono solo quelle abilitate dall'admin in
            /admin/settings/languages (vedi getEnabledLocales). */}
        {locales.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="locale">Lingua preferita</Label>
            <select
              id="locale"
              name="locale"
              defaultValue={initial.locale}
              className="flex w-full rounded-2xl border px-4 py-2.5 text-sm bg-brand-surface-card text-brand-text border-brand-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-border-focus-rgb),0.2)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50">
              <option value="">Auto (rileva dal browser)</option>
              {locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeLabel}
                </option>
              ))}
            </select>
            <p className="text-[11.5px] text-gc-fg-3 px-1">
              Determina la lingua del pannello admin e delle email. Modifica subito al salvataggio.
            </p>
          </div>
        )}

        {profileState.error && (
          <p className="text-[13px] text-gc-neg">{profileState.error}</p>
        )}
        {profileState.success && (
          <p className="text-[13px] text-gc-success-fg">{profileState.success}</p>
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
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // useActionState è il pattern canonico Next 16 per server actions.
  // Pattern "useTransition + await action(...)" usato prima fallisce
  // sul transport interno quando la action ritorna un FormData-driven
  // payload (la response stream non si chiude correttamente in dev mode).
  // Vedere lo storico di refactor di sentry-form/prices-settings-form
  // che hanno la stessa shape.
  const [uploadState, uploadAction, uploading] = useActionState<
    UploadAvatarState,
    FormData
  >(uploadAvatar, {});
  const [removeState, removeAction, removing] = useActionState<
    ActionState,
    FormData
  >(removeAvatar, {});

  // Sincronizziamo l'esito delle action col local state (error/upload-callback).
  // useActionState non ha timestamp built-in, ma le response sono "fresh"
  // dopo ogni dispatch quindi questo useEffect parte solo quando state cambia.
  const lastUploadStateRef = useRef(uploadState);
  useEffect(() => {
    if (uploadState === lastUploadStateRef.current) return;
    lastUploadStateRef.current = uploadState;
    if ("error" in uploadState && uploadState.error) {
      setError(uploadState.error);
      setCropSrc(null);
    } else if ("url" in uploadState && uploadState.url) {
      onUploaded(uploadState.url);
      setCropSrc(null);
    }
  }, [uploadState, onUploaded]);

  const lastRemoveStateRef = useRef(removeState);
  useEffect(() => {
    if (removeState === lastRemoveStateRef.current) return;
    lastRemoveStateRef.current = removeState;
    if ("error" in removeState && removeState.error) {
      setError(removeState.error);
    } else if ("success" in removeState && removeState.success) {
      onRemoved();
    }
  }, [removeState, onRemoved]);

  // Revoca il blob URL precedente quando ne creiamo uno nuovo o quando smontiamo
  useEffect(() => {
    return () => {
      if (cropSrc?.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function pickFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Seleziona un file immagine.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Immagine troppo grande. Massimo 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  }

  function handleCropCancel() {
    if (uploading) return;
    setCropSrc(null);
  }

  function handleCropConfirm(cropped: File) {
    const formData = new FormData();
    formData.append("avatar", cropped);
    uploadAction(formData);
  }

  function triggerRemove() {
    setError(null);
    removeAction(new FormData());
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
          PNG, JPG o WebP. Potrai ritagliare e zoomare prima del salvataggio.
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
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <AvatarCropDialog
        open={cropSrc !== null}
        imageSrc={cropSrc}
        saving={uploading}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </section>
  );
}
