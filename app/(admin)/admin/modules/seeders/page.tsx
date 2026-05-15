// /admin/modules/seeders — pannello operatore.
//
// Mostra il count corrente dei seed users, espone un form per
// generarne di nuovi (con opzioni posts/immagini/blocks), e un bottone
// di cleanup totale (lockdown su email pattern, niente rischio real users).
import type { Metadata } from "next";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { countSeedUsers } from "@/lib/modules/seeders/services/user-seeder";
import { SeedersClient } from "./_components/seeders-client";

export const metadata: Metadata = { title: "Seeders" };
export const dynamic = "force-dynamic";

export default async function SeedersPage() {
  await requireAdminSectionPage("modules:seeders");
  const seedUsersCount = await countSeedUsers();

  return <SeedersClient initialSeedUsersCount={seedUsersCount} />;
}
