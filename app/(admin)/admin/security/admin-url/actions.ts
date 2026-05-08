"use server";

import { ADMIN_URL_SLUG_TAG } from "@/lib/admin-paths";
import {
  ADMIN_RESERVED_SLUGS,
  validateAdminSlugSync,
} from "@/lib/admin-paths-shared";
import { db } from "@/lib/db/drizzle";
import { pages } from "@/lib/db/schema";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdmin } from "@/lib/rbac/guards";
import { can } from "@/lib/rbac/can";
import { and, eq, ne } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number; redirectTo?: string }
  | { error: string; timestamp: number };

const formSchema = z.object({
  slug: z.string().trim().min(2).max(40),
});

/**
 * Cambia lo slug dell'URL admin a runtime.
 *
 * Step:
 *   1. Guard `admin:security` (oltre al layout, defense-in-depth).
 *   2. Validazione formato + reserved list.
 *   3. Validazione collisione: il nuovo slug NON deve esistere come slug
 *      di una pagina CMS (`pages.slug`) — escluse le system pages
 *      `admin_home` / `admin_sign_in` che vengono aggiornate insieme.
 *   4. Update `app_settings.admin_url_slug`.
 *   5. Update righe `pages` per `admin_home` (slug = newSlug) e
 *      `admin_sign_in` (slug = `${newSlug}/sign-in`).
 *   6. `updateTag(ADMIN_URL_SLUG_TAG)` → proxy.ts e tutti i caller server
 *      vedono il nuovo valore alla prossima request.
 *   7. Redirect alla stessa pagina sul NUOVO URL: l'utente continua a
 *      lavorare senza dover digitare manualmente. Il cookie sessione resta
 *      valido perché lo stesso dominio.
 */
export async function saveAdminUrlSlug(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.security.adminUrl.actionMessages");
  try {
    const user = await requireAdmin();
    if (!user.isAdmin && !(await can(user, "admin:security"))) {
      return { error: t("notAuthorized"), timestamp: Date.now() };
    }

    const parsed = formSchema.safeParse({ slug: formData.get("slug") });
    if (!parsed.success) {
      return { error: t("invalidFormat"), timestamp: Date.now() };
    }

    const validated = validateAdminSlugSync(parsed.data.slug);
    if (!validated.ok) {
      const key =
        validated.reason === "reserved" ? "reservedSlug" : "invalidFormat";
      return { error: t(key), timestamp: Date.now() };
    }
    const newSlug = validated.slug;

    // Collision check vs `pages.slug`. Escludiamo le 2 system pages che
    // verranno aggiornate qui sotto: la loro slug attuale è il vecchio
    // valore admin (es. "admin" / "admin/sign-in"), e potenzialmente
    // collide se il nuovo slug è "admin" — ma in quel caso non c'è
    // niente da fare (no-op).
    const collisions = await db
      .select({ slug: pages.slug, systemKey: pages.systemKey })
      .from(pages)
      .where(eq(pages.slug, newSlug));
    const realCollisions = collisions.filter(
      (r) => r.systemKey !== "admin_home",
    );
    if (realCollisions.length > 0) {
      return {
        error: t("collision", { slug: newSlug }),
        timestamp: Date.now(),
      };
    }

    // Aggiorna in transazione: settings + pages system. Se una fallisce,
    // niente viene applicato → niente stato inconsistente.
    await db.transaction(async (tx) => {
      // app_settings.admin_url_slug
      await updateAppSetting("admin.url_slug", newSlug);
      // pages row "admin_home" → slug = newSlug
      await tx
        .update(pages)
        .set({ slug: newSlug, updatedAt: new Date() })
        .where(eq(pages.systemKey, "admin_home"));
      // pages row "admin_sign_in" → slug = `${newSlug}/sign-in`
      await tx
        .update(pages)
        .set({ slug: `${newSlug}/sign-in`, updatedAt: new Date() })
        .where(eq(pages.systemKey, "admin_sign_in"));
    });

    // Invalida la cache del slug (proxy.ts + tutti i `getAdminUrlSlug()`).
    updateTag(ADMIN_URL_SLUG_TAG);

    // Redirect alla stessa pagina sul nuovo URL.
    redirect(`/${newSlug}/security/admin-url?changed=1`);
  } catch (err) {
    // `redirect()` di Next lancia un'eccezione interna NEXT_REDIRECT che
    // NON va catturata: rilanciamola per consentire il redirect al client.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("[admin/security/admin-url] saveAdminUrlSlug failed:", err);
    return { error: t("saveFailed"), timestamp: Date.now() };
  }
}

/** Esposta solo per validazione live nel form (no DB). */
export async function checkSlugFormat(slug: string): Promise<{
  ok: boolean;
  reason?: "format" | "reserved";
  reserved?: readonly string[];
}> {
  const validated = validateAdminSlugSync(slug);
  if (validated.ok) return { ok: true };
  return {
    ok: false,
    reason: validated.reason === "reserved" ? "reserved" : "format",
    reserved:
      validated.reason === "reserved" ? ADMIN_RESERVED_SLUGS : undefined,
  };
}
