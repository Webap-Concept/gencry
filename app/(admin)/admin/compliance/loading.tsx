import {
  FormSkeleton,
  PageHeaderSkeleton,
} from "../_components/skeletons";

export default function ComplianceLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <FormSkeleton fields={4} />
    </div>
  );
}
