// app/manifest.ts
//
// PWA web manifest generato server-side. Le icone arrivano dai brand
// asset configurati in /admin/settings/general (slot pwa-icon-192 e
// pwa-icon-512), serviti da R2 (bucket `assets`). Il manifest viene
// esposto da Next a `/manifest.webmanifest` con `<link rel="manifest">`
// auto-iniettato nell'<head>.
//
// Se l'admin non ha caricato le icone, ritorniamo un manifest senza
// `icons[]`: il manifest resta valido ma il browser non potrà offrire
// Add to Home Screen finché le icone non sono presenti.
import type { MetadataRoute } from "next";
import { getCachedAppSettings } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getCachedAppSettings();
  const name = s.app_name?.trim() || "App";
  const description = s.app_description?.trim() || undefined;

  const icons: MetadataRoute.Manifest["icons"] = [];
  if (s.app_pwa_icon_192_url) {
    icons.push({
      src: s.app_pwa_icon_192_url,
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    });
  }
  if (s.app_pwa_icon_512_url) {
    icons.push({
      src: s.app_pwa_icon_512_url,
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    });
  }

  return {
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description,
    start_url: "/",
    display: "standalone",
    background_color: "#f5ecdc",
    theme_color: "#fa8b1e",
    icons,
  };
}
