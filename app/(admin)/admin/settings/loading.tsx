import {
  FormSkeleton,
  PageHeaderSkeleton,
} from "../_components/skeletons";

export default function SettingsLoading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <FormSkeleton fields={5} />
    </div>
  );
}
