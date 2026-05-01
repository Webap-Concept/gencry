import { redirect } from "next/navigation";
import { getUser } from "@/lib/db/queries";
import { getAcceptedConsent, type ConsentSnapshot } from "@/lib/account/consents";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import { ConsentsPanel, type ConsentVM } from "./_components/consents-panel";

export default async function PrivacySettingsPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const [terms, privacy, marketing] = await Promise.all([
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
  ]);

  return (
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
