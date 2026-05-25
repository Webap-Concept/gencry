// lib/modules/posts/probes/post-cache-hit-rate-loader.ts
//
// Loader server-only re-exportato dal scaling-triggers-manifest del
// modulo. Il pattern: il manifest dinamico-importa SOLO file che vivono
// dentro `lib/modules/posts/`, così la catena di import resta locale
// al modulo e non viene seguita dal client bundling (vedi sitemap-stats).
//
// Il vero lavoro è in lib/admin/scaling-triggers/probes/post-cache-hit-rate.
import "server-only";
export { default } from "@/lib/admin/scaling-triggers/probes/post-cache-hit-rate";
