import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/rbac/guards";
import { getBruteforceData } from "./actions";
import { BruteforceClient } from "./_components/bruteforce-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.security.bruteforce");
  return { title: t("metaTitle") };
}

async function BruteforceContent() {
  const data = await getBruteforceData();
  return <BruteforceClient {...data} />;
}

export default async function AdminBruteforcePage() {
  await requireAdminPage();

  return (
    <Suspense
        fallback={
          <div className="flex items-center justify-center h-40">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--admin-accent)", borderTopColor: "transparent" }}
            />
          </div>
        }
      >
        <BruteforceContent />
      </Suspense>
  );
}
