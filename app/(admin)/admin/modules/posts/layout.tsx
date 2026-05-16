import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import type { Metadata } from "next";
import { PostsHeader } from "./_components/posts-header";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:posts");
  const slug = await getAdminUrlSlug();
  return (
    // PostsHeader fuori dal `space-y-5`: in un wrapper space-y il
    // 2° child (header) riceverebbe margin-top, creando un buco di
    // 20px sopra l'header sticky. Lo `mt-5` sul wrapper interno
    // sostituisce esattamente quello space tra header e content.
    <>
      <PostsHeader adminSlug={slug} />
      <div className="space-y-5 mt-5">{children}</div>
    </>
  );
}
