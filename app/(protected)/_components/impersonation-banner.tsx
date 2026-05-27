// app/(protected)/_components/impersonation-banner.tsx
//
// Banner persistente che appare in TUTTE le pagine (protected) quando la
// sessione corrente e' un'impersonation (admin → user). Mostra chi sta
// venendo impersonato + bottone "Termina" che ripristina la session admin.
//
// Server Component: legge `getSession()` direttamente, fa il rendering
// del banner solo se `impersonatorSessionId != null`. Il form usa una
// Server Action via `<form action={...}>` per evitare hydratation
// boundary (un piccolo form e' meglio di un client component qui).
//
// Scope: visibile solo nelle pagine (protected). L'admin che impersona
// passa per /  → entra qui → vede il banner sopra tutto. Click su
// "Termina" → server action revoca current + ripristina admin cookie +
// redirect su /admin/access/users.
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { userProfiles, users } from "@/lib/db/schema";
import { adminStopImpersonation } from "@/app/(admin)/admin/access/users/actions";
import { eq } from "drizzle-orm";
import { Eye, LogOut } from "lucide-react";

export async function ImpersonationBanner() {
  const session = await getSession();
  if (!session || !session.impersonatorSessionId) return null;

  // Mostra @handle dell'utente impersonato. Best-effort: se la query fail
  // o profile manca, mostra l'id (sempre disponibile).
  let displayHandle = `id:${session.user.id.slice(0, 8)}`;
  try {
    const [row] = await db
      .select({
        username: userProfiles.username,
        email: users.email,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (row?.username) displayHandle = `@${row.username}`;
    else if (row?.email) displayHandle = row.email;
  } catch {
    // ignore — fallback already in place
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-50 w-full"
      style={{
        background: "color-mix(in srgb, #f59e0b 92%, transparent)",
        color: "#1f1300",
        borderBottom: "1px solid color-mix(in srgb, #b45309 60%, transparent)",
      }}>
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={14} className="shrink-0" />
          <span className="truncate">
            <strong>Modalità impersonation attiva</strong> · Stai navigando come{" "}
            <strong>{displayHandle}</strong>. Tutte le azioni vengono attribuite a questo utente.
          </span>
        </div>
        <form action={stopImpersonationAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1 rounded-md font-medium text-[12px] shrink-0 transition-colors"
            style={{
              background: "#1f1300",
              color: "#fff",
            }}>
            <LogOut size={12} />
            Termina
          </button>
        </form>
      </div>
    </div>
  );
}

// Server Action wrapper — il form `action={...}` vuole una function che
// matchi la signature `(formData: FormData) => Promise<void> | void`.
// adminStopImpersonation fa redirect interno; ritorna un errore solo se
// la sessione corrente non e' impersonata (defensive, raro qui).
async function stopImpersonationAction(_formData: FormData) {
  "use server";
  await adminStopImpersonation();
}
