// lib/modules/onboarding/manifest.ts
// Manifest del modulo Onboarding.
//
// Il modulo registra solo:
//   - 1 voce nav admin "Onboarding" → /admin/modules/onboarding
//   - permission `modules:onboarding`
//
// Niente cron, niente userTab. Il flusso utente vive in
// `app/(onboarding)/onboarding/` (UI) e in `lib/auth/onboarding-gate.ts`
// (gate auth core che redirige al wizard quando il modulo è installato +
// abilitato). Vedi feedback_module_isolation.md per il razionale di cosa
// resta core e cosa è del modulo.
import type { ModuleManifest } from "@/lib/modules/types";

export const ONBOARDING_MODULE: ModuleManifest = {
  slug: "onboarding",
  label: "Onboarding",
  description: "Post-signup wizard. Optional, can be disabled per-deploy.",
  version: "1.0.0",
  icon: "Sparkles",
  permission: "modules:onboarding",
  permissionLabel: "Access Onboarding module",
  navChildren: [
    {
      key: "onboarding-settings",
      href: "/modules/onboarding",
      label: "Settings",
      icon: "Settings",
      permission: "modules:onboarding",
      exact: true,
    },
  ],
  cronJobs: [],
};
