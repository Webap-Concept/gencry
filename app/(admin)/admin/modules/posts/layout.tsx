import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { Metadata } from "next";
import { PostsHeader } from "./_components/posts-header";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("modules:posts");
  return (
    <div className="space-y-5">
      <PostsHeader />
      {children}
    </div>
  );
}
