import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "../_components/skeletons";

export default function SecurityLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
