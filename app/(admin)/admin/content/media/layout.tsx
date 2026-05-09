import { requireAdminSectionPage } from "@/lib/rbac/guards";

export default async function MediaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Media library standalone: chiunque possa creare contenuti deve
  // poterci entrare. Niente permesso content:media separato — dentro
  // il page editor il MediaPicker deve sempre funzionare per chi ha
  // content:create, non ha senso splittarlo.
  await requireAdminSectionPage("content:create");
  return <>{children}</>;
}
