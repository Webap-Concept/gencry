import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getAcceptedConsent, type ConsentSnapshot } from "@/lib/account/consents";
import { listMyExportJobs } from "@/lib/account/gdpr-export";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import { ConsentsPanel, type ConsentVM } from "./_components/consents-panel";
import { DangerZone } from "./_components/danger-zone";
import { ExportPanel, type ExportJobVM } from "./_components/export-panel";

export default async function PrivacySettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const [terms, privacy, marketing, exportJobs] = await Promise.all([
    getAcceptedConsent({
      systemKey: "terms",
      acceptedVersion: user.acceptedTermsVersion,
    }),
    getAcceptedConsent({
      systemKey: "privacy",
      acceptedVersion: user.acceptedPrivacyVersion,
    }),
    getAcceptedConsent({
      systemKey: "marketing",
      acceptedVersion: user.acceptedMarketingVersion,
    }),
    listMyExportJobs(user.id, 5),
  ]);

  const exportJobsVM: ExportJobVM[] = exportJobs.map((j) => ({
    id: j.id,
    status: j.status,
    requestedAt: j.requestedAt.toISOString(),
    completedAt: j.completedAt?.toISOString() ?? null,
    expiresAt: j.expiresAt?.toISOString() ?? null,
    canDownload:
      j.status === "ready" &&
      j.hasFile &&
      (j.expiresAt === null || j.expiresAt.getTime() > Date.now()),
  }));

  return (
    <div className="space-y-12">
      <ConsentsPanel
        terms={toVM({
          fallbackTitle: "Termini e Condizioni",
          acceptedAt: user.acceptedTermsAt,
          acceptedVersion: user.acceptedTermsVersion,
          snapshot: terms,
        })}
        privacy={toVM({
          fallbackTitle: "Privacy Policy",
          acceptedAt: user.acceptedPrivacyAt,
          acceptedVersion: user.acceptedPrivacyVersion,
          snapshot: privacy,
        })}
        marketing={toVM({
          fallbackTitle: "Comunicazioni marketing",
          acceptedAt: user.acceptedMarketingAt,
          acceptedVersion: user.acceptedMarketingVersion,
          snapshot: marketing,
        })}
      />

      <ExportPanel jobs={exportJobsVM} />

      <DangerZone hasPassword={user.passwordHash !== null} />
    </div>
  );
}

function toVM(input: {
  fallbackTitle: string;
  acceptedAt: Date | null;
  acceptedVersion: string | null;
  snapshot: ConsentSnapshot | null;
}): ConsentVM {
  const { fallbackTitle, acceptedAt, acceptedVersion, snapshot } = input;

  return {
    title: snapshot?.title || fallbackTitle,
    acceptedAt: acceptedAt?.toISOString() ?? null,
    acceptedVersion,
    currentVersion: snapshot?.currentVersion ?? null,
    contentHtml: snapshot ? sanitizeRichTextHtml(snapshot.content) : null,
    isCurrent: snapshot?.isCurrent ?? false,
  };
}
