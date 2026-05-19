/**
 * Handler della 404 per il group `(cms)`.
 *
 * Esiste perché in Next 16 il root `app/not-found.tsx` viene wrappato
 * SOLO dentro il root layout — quindi `frontend.css` (token `--gc-bg`,
 * `--gc-fg`, `@keyframes gc-blink`, ecc.) non sarebbe caricato e la
 * 404 risulterebbe completamente senza stile e senza animazioni.
 *
 * Tenendo questo file dentro `(cms)/`, Next lo seleziona quando
 * `notFound()` parte da una rotta del group (es. CmsPage), e il
 * rendering passa per `(cms)/layout.tsx` → frontend.css incluso.
 */
import { NotFoundShell } from "@/components/not-found/NotFoundShell";

export const dynamic = "force-dynamic";

export default async function FrontendNotFound() {
  return <NotFoundShell />;
}
