import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getItemWithRels, getReviewerName } from "@/lib/modules/news/queries";
import { ReviewEditor } from "./_components/review-editor";

export const metadata: Metadata = { title: "News / Review" };
export const dynamic = "force-dynamic";

export default async function NewsReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItemWithRels(id);
  if (!item) notFound();

  const reviewerName = item.reviewedBy ? await getReviewerName(item.reviewedBy) : null;

  return <ReviewEditor item={item} reviewerName={reviewerName} />;
}
