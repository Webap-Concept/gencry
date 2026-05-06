// app/(admin)/admin/redirect/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getRedirects } from "@/lib/db/redirects-queries";
import { deleteRedirectAction, toggleAutoRedirectAction, upsertRedirectAction } from "./actions";
import RedirectsClient from "./_components/redirects-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.seo.redirect");
  return { title: t("metaTitle") };
}

export default async function RedirectsPage() {
  const [manual, automatic] = await Promise.all([
    getRedirects("manual"),
    getRedirects("auto_slug"),
  ]);
  return (
    <RedirectsClient
      manualRows={manual}
      automaticRows={automatic}
      deleteAction={deleteRedirectAction}
      upsertAction={upsertRedirectAction}
      toggleAutoAction={toggleAutoRedirectAction}
    />
  );
}
