import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "../_components/skeletons";

export default function SeoLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <TableSkeleton rows={5} />
    </div>
  );
}
