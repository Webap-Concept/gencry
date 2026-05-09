import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "../_components/skeletons";

export default function AccessLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}
