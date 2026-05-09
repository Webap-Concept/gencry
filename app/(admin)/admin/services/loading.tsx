import {
  FormSkeleton,
  PageHeaderSkeleton,
} from "../_components/skeletons";

export default function ServicesLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <FormSkeleton fields={6} />
    </div>
  );
}
