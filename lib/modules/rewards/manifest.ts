// lib/modules/rewards/manifest.ts
import type { CapacityProfile, ModuleManifest } from "@/lib/modules/types";
import { REWARDS_PERMISSION } from "./permissions";

const REWARDS_CAPACITY: CapacityProfile = {
  scope: "earn-engine",
  label: "Earn Engine",
  currentTier: "alpha",
  resources: [
    {
      name: "Postgres (rewards_ledger)",
      plan: "Supabase Free",
      limits: [
        "1 INSERT su rewards_ledger per evento applicativo (daily_checkin, post_created)",
        "1 INSERT su rewards_ledger via trigger DB per ogni like_received (non auto-liked)",
        "Trigger rewards_ledger_balance_trg: 1 UPSERT su rewards_balances per INSERT ledger",
        "Index rewards_ledger_user_idempotency_uq: lookup O(log n) per deduplication",
      ],
      upgradeAt: "~500k transazioni/mese (stima: 5k DAU × 100 eventi/mese)",
      upgradePath:
        "Supabase Pro o pooler session mode. Le 3 tabelle restano su Postgres: il volume assoluto è basso (il trigger è leggero, solo 1 riga per evento).",
    },
  ],
  tunables: [
    { key: "modules.rewards.daily_checkin.amount",    label: "Coins per check-in giornaliero" },
    { key: "modules.rewards.post_created.amount",     label: "Coins per post pubblicato" },
    { key: "modules.rewards.post_created.daily_cap",  label: "Cap giornaliero post (0 = illimitato)" },
    { key: "modules.rewards.like_received.amount",    label: "Coins per like ricevuto" },
    { key: "modules.rewards.like_received.daily_cap", label: "Cap giornaliero like ricevuti" },
  ],
  presets: [
    {
      id: "alpha",
      label: "Alpha (<1k MAU)",
      description: "Generoso: coin facili da guadagnare per test e early adopters.",
      values: {
        "modules.rewards.daily_checkin.amount":    "10",
        "modules.rewards.post_created.amount":      "5",
        "modules.rewards.post_created.daily_cap":   "3",
        "modules.rewards.like_received.amount":     "1",
        "modules.rewards.like_received.daily_cap":  "20",
      },
    },
    {
      id: "beta",
      label: "Beta (1k-10k MAU)",
      description: "Bilanciato: check-in pesa di più, engagement genera meno per evitare farming.",
      values: {
        "modules.rewards.daily_checkin.amount":    "15",
        "modules.rewards.post_created.amount":      "3",
        "modules.rewards.post_created.daily_cap":   "2",
        "modules.rewards.like_received.amount":     "1",
        "modules.rewards.like_received.daily_cap":  "10",
      },
    },
    {
      id: "growth",
      label: "Growth (10k-100k MAU)",
      description: "Conservativo: i coin diventano più rari per mantenere il valore percepito.",
      values: {
        "modules.rewards.daily_checkin.amount":    "20",
        "modules.rewards.post_created.amount":      "2",
        "modules.rewards.post_created.daily_cap":   "1",
        "modules.rewards.like_received.amount":     "1",
        "modules.rewards.like_received.daily_cap":  "5",
      },
    },
    {
      id: "scale",
      label: "Scale (100k+ MAU)",
      description: "Solo check-in: i like e post come meccanismo di accumulo primario vengono disabilitati per evitare inflazione.",
      values: {
        "modules.rewards.daily_checkin.amount":    "25",
        "modules.rewards.post_created.amount":      "1",
        "modules.rewards.post_created.daily_cap":   "1",
        "modules.rewards.like_received.amount":     "1",
        "modules.rewards.like_received.daily_cap":  "3",
      },
    },
  ],
};

export const REWARDS_MODULE: ModuleManifest = {
  slug: "rewards",
  label: "Rewards",
  description:
    "Virtual coin economy per la gamification: gli utenti accumulano coin con check-in giornalieri, post e like ricevuti. Earn engine con ledger append-only e saldo denormalizzato.",
  version: "0.1.0",
  icon: "Coins",
  permission: REWARDS_PERMISSION,
  permissionLabel: "Access Rewards module",
  navChildren: [
    {
      key: "rewards-overview",
      href: "/modules/rewards",
      label: "Overview",
      icon: "Activity",
      permission: REWARDS_PERMISSION,
      exact: true,
    },
    {
      key: "rewards-settings",
      href: "/modules/rewards/settings",
      label: "Settings",
      icon: "Settings",
      permission: REWARDS_PERMISSION,
    },
    {
      key: "rewards-architecture",
      href: "/modules/rewards/architecture",
      label: "Architecture",
      icon: "BookOpen",
      permission: REWARDS_PERMISSION,
    },
  ],
  cronJobs: [],
  capacityProfiles: [REWARDS_CAPACITY],
};
