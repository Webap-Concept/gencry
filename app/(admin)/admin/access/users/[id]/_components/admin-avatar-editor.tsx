"use client";
// app/(admin)/admin/access/users/[id]/_components/admin-avatar-editor.tsx
//
// Editor avatar admin-side: permette agli admin con `users:edit` di
// modificare o rimuovere l'avatar di un utente qualsiasi.
//
// UX: avatar grande nell'header detail page con overlay hover "Modifica".
// Click apre file picker → preview crop dialog (versione admin con
// AdminDialog + AdminButton, regola feedback_admin_no_frontend_css) →
// onConfirm chiama `adminUpdateUserAvatar(targetUserId, formData)`.
// Sotto, trash button se l'utente ha gia' un avatar.
//
// Audit: server action logga `AVATAR_UPDATED_BY_ADMIN` sull'activity
// dell'utente target. L'utente non vede questo log (no UI client-side
// per /settings/activity), e' interno admin.

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { AdminAvatarCropDialog } from "@/app/(admin)/admin/_components/admin-avatar-crop-dialog";
import {
  adminRemoveUserAvatar,
  adminUpdateUserAvatar,
} from "../../actions";

type Props = {
  userId: string;
  /** URL attuale dell'avatar (null se non impostato). Sincronizzato col
   *  router.refresh() dopo l'azione. */
  avatarUrl: string | null;
  /** Iniziali fallback se l'avatar e' null (es. "MR"). */
  initials: string;
  /** Disabilita la modifica per utenti deletati. */
  disabled?: boolean;
};

export function AdminAvatarEditor({
  userId,
  avatarUrl,
  initials,
  disabled = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Revoca il blob URL al cambio o smontaggio
  useEffect(() => {
    return () => {
      if (cropSrc?.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function pickFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Formato non supportato. Usa PNG, JPG o WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("File troppo grande (max 8 MB prima del crop).");
      return;
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  }

  function handleCropCancel() {
    if (pending) return;
    setCropSrc(null);
  }

  function handleCropConfirm(cropped: File) {
    const formData = new FormData();
    formData.append("avatar", cropped);
    startTransition(async () => {
      const res = await adminUpdateUserAvatar(userId, formData);
      if (!res.ok) {
        setError(res.error);
      } else {
        setError(null);
        // revalidatePath nel server action aggiornera' l'header al
        // prossimo render (router.refresh implicito su action result).
      }
      setCropSrc(null);
    });
  }

  function handleRemove() {
    // Operazione reversibile (basta ricaricare un nuovo avatar) → niente
    // confirm modale. Coerente con feedback_admin_confirm_modal:
    // confirm-modal e' richiesto solo per destructive non-reversibili.
    setError(null);
    startTransition(async () => {
      const res = await adminRemoveUserAvatar(userId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="relative">
      <div className="relative group">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar utente"
            className="w-14 h-14 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 text-white"
            style={{ background: "var(--admin-accent)" }}>
            {initials}
          </div>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            aria-label="Modifica avatar utente"
            className="absolute inset-0 rounded-full flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 disabled:cursor-wait"
            style={{
              background: "rgba(0, 0, 0, 0.55)",
              color: "#fff",
            }}>
            {pending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Camera size={16} strokeWidth={1.8} />
            )}
          </button>
        )}
      </div>

      {!disabled && avatarUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={pending}
          aria-label="Rimuovi avatar"
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-colors disabled:opacity-50"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            color: "var(--gc-neg, #dc2626)",
          }}>
          <Trash2 size={11} strokeWidth={2} />
        </button>
      )}

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

      {error && (
        <p
          className="absolute top-full left-0 mt-1 text-[11px] whitespace-nowrap"
          style={{ color: "var(--gc-neg, #dc2626)" }}
          role="alert">
          {error}
        </p>
      )}

      <AdminAvatarCropDialog
        open={cropSrc !== null}
        imageSrc={cropSrc}
        saving={pending}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}
