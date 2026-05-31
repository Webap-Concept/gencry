// lib/account/business-sectors.ts
//
// Lista curata dei settori azienda. File senza "server-only": importabile
// sia dal form client (dropdown) che dalla validazione server. I label
// visibili sono tradotti via i18n (namespace core.settings.business.sectors).

export const BUSINESS_SECTORS = [
  "exchange",
  "wallet",
  "defi",
  "nft",
  "mining",
  "media",
  "education",
  "fund",
  "other",
] as const;

export type BusinessSector = (typeof BUSINESS_SECTORS)[number];

export function isValidSector(value: string): value is BusinessSector {
  return (BUSINESS_SECTORS as readonly string[]).includes(value);
}
