// Server wrapper: legge le tabs dal manifest del modulo (single
// source of truth con la sidebar) e le passa al client component
// che gestisce active state + info-button guide per segment.
import { getModuleTabs } from "@/lib/admin-module-tabs";
import { POSTS_MODULE } from "@/lib/modules/posts/manifest";
import { PostsHeaderClient } from "./posts-header-client";

export async function PostsHeader() {
  const tabs = await getModuleTabs(POSTS_MODULE);
  return <PostsHeaderClient tabs={tabs} />;
}
