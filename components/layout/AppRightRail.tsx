import Link from "next/link";
import { CircleDollarSign, Sparkles, BadgeCheck } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { COMPANIES } from "@/lib/shared/mock";

// Right rail della home loggata. Server-friendly: niente state né hooks.
// Visibile da lg in su; su tablet (md) viene nascosta per dare spazio al feed.

type Sponsor = {
  Icon: typeof Sparkles;
  label: string;
  title: string;
  body: string;
  cta: string;
};

const SPONSORS: Sponsor[] = [
  {
    Icon: CircleDollarSign,
    label: "sponsor",
    title: "Earn fino al 6.4% sui tuoi USDC",
    body: "Staking flessibile su Young Platform. Senza vincoli, prelievo in 24h.",
    cta: "Scopri →",
  },
  {
    Icon: Sparkles,
    label: "adv",
    title: "Il primo corso DeFi in italiano",
    body: "12 lezioni, 4 ore. Da zero ai protocolli più usati. Gratis per la community.",
    cta: "Iscriviti",
  },
];

export function AppRightRail() {
  return (
    <aside className="hidden lg:flex flex-col shrink-0 w-72 sticky top-0 h-screen overflow-y-auto py-6 pl-6 pr-4 gap-4">
      {SPONSORS.map((s) => (
        <SponsorCard key={s.title} sponsor={s} />
      ))}

      <CompaniesSection />

      <FooterLinks />
    </aside>
  );
}

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  const { Icon, label, title, body, cta } = sponsor;
  return (
    <article className="bg-gc-bg-2 border border-gc-line rounded-gc p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-full bg-gc-bg-3 border border-gc-line flex items-center justify-center text-gc-fg flex-shrink-0">
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <span className="text-[10px] uppercase tracking-[0.08em] text-gc-fg-3 px-2 py-0.5 border border-gc-line rounded-full">
          {label}
        </span>
      </div>
      <h3 className="font-display font-normal text-[19px] leading-[1.15] tracking-[-0.01em] text-gc-fg">
        {title}
      </h3>
      <p className="text-[12.5px] text-gc-fg-2 leading-snug">{body}</p>
      <button
        type="button"
        className="self-start mt-1 inline-flex items-center px-3.5 py-1.5 rounded-full bg-gc-accent text-white text-[12.5px] font-medium hover:brightness-95 transition"
      >
        {cta}
      </button>
    </article>
  );
}

function CompaniesSection() {
  return (
    <section className="mt-2">
      <h3 className="text-[10.5px] uppercase tracking-[0.08em] text-gc-fg-3 font-medium mb-3 px-1">
        Aziende verificate
      </h3>
      <ul className="flex flex-col gap-2">
        {COMPANIES.map((c) => (
          <li key={c.handle}>
            <CompanyRow company={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompanyRow({ company }: { company: typeof COMPANIES[number] }) {
  // Avatar accetta la shape User; ricostruisco da Company.
  const avatarUser = {
    handle: company.handle,
    name: company.name,
    avatar: company.avatar,
    color: company.color,
    followers: 0,
    bio: "",
  };
  return (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <Avatar user={avatarUser} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[13px] font-medium text-gc-fg truncate">
          <span className="truncate">{company.name}</span>
          {company.verified && (
            <BadgeCheck
              size={14}
              strokeWidth={1.75}
              className="text-gc-accent flex-shrink-0"
            />
          )}
        </div>
        <div className="text-[11.5px] text-gc-fg-3 font-mono truncate">
          @{company.handle}
        </div>
      </div>
      <button
        type="button"
        className="px-3 py-1 text-[12px] font-medium rounded-full border border-gc-line-2 text-gc-fg-2 hover:bg-gc-bg-2 hover:border-gc-fg transition"
      >
        Segui
      </button>
    </div>
  );
}

function FooterLinks() {
  return (
    <footer className="mt-3 pt-3 text-[11.5px] text-gc-fg-3 leading-relaxed px-1">
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        <Link href="/aziende" className="hover:text-gc-fg transition">
          Pubblicizza la tua azienda
        </Link>
        <span>·</span>
        <Link href="/termini" className="hover:text-gc-fg transition">
          Termini
        </Link>
        <span>·</span>
        <Link href="/privacy" className="hover:text-gc-fg transition">
          Privacy
        </Link>
      </div>
      <div className="mt-1.5">© {new Date().getFullYear()} GenerazioneCrypto</div>
    </footer>
  );
}
