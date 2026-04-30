// app/(login)/verify-device/page.tsx
//
// Guard: accessibile solo con un cookie pending_device_auth valido (JWT 10 min),
// settato da signIn / Google callback quando il dispositivo non è riconosciuto.
// Se il cookie manca o è scaduto, redirect a /sign-in.

import { getSession } from "@/lib/auth/session";
import { getPendingAuth } from "@/lib/auth/trusted-device";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyDeviceForm } from "./verify-device-form";

export const metadata: Metadata = { title: "Verifica dispositivo" };

export default async function VerifyDevicePage() {
  // Chi ha già una sessione attiva non deve stare qui
  const session = await getSession();
  if (session) {
    redirect(session.user.role === "admin" ? "/admin" : "/");
  }

  // Senza pending auth cookie il flusso non è iniziato → torna al login
  const pending = await getPendingAuth();
  if (!pending) {
    redirect("/sign-in");
  }

  return <VerifyDeviceForm />;
}
