import { CmsPage, cmsPageMetadata } from "@/app/(cms)/_render/cms-page";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return cmsPageMetadata({ slug });
}

export default async function FrontendPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  return <CmsPage slug={slug} />;
}
