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
    <div className="space-y-5">
      <PostsHeader adminSlug={slug} />
      {children}
    </div>
  );
}
