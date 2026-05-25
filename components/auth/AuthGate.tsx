"use client";
// components/auth/AuthGate.tsx
//
// Wrapper per UI che richiede login. Renderizza `children` se il
// viewer è loggato, `fallback` altrimenti. Senza fallback → null per
// gli anon.
//
// Use case tipici:
//   <AuthGate fallback={<SignUpCta intent="react" />}>
//     <ReactionButton ... />
//   </AuthGate>
//
//   <AuthGate>
//     <BookmarkButton ... />
//   </AuthGate>  // anon non vedono nulla
//
// Non duplica la sicurezza: le Server Actions hanno comunque `getUser()`
// guard. AuthGate è SOLO UX — evita il toast "errore unauthenticated"
// dopo un click che era prevedibilmente vietato.
import type { ReactNode } from "react";
import { useViewer } from "./ViewerProvider";

export function AuthGate({
  children,
  fallback = null,
}: {
  children: ReactNode;
  /** Render quando viewer è anon. Default: null (componente sparisce). */
  fallback?: ReactNode;
}) {
  const { isLoggedIn } = useViewer();
  if (!isLoggedIn) return <>{fallback}</>;
  return <>{children}</>;
}
