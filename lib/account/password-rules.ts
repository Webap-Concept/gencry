// lib/account/password-rules.ts
//
// Regole di forza password — usate sia client (indicatori live nei form)
// sia server (validazione in changePassword). File puro: nessuna dipendenza
// server-only così può essere importato anche da Client Component.
//
// i18n: le label NON vivono qui. Il caller client (PasswordRulesList in
// account-form, e i form di sign-in/reset/register) recupera la label
// via `useTranslations("auth.passwordRulesShort|Long|Staff")(rule.id)`.
// Questo file resta puro logic — id + test — così è importabile sia
// server (isStrongPassword in password-change) sia client.

export type PasswordRuleId = "min" | "upper" | "number" | "special";

export const passwordRules: Array<{
  id: PasswordRuleId;
  test: (p: string) => boolean;
}> = [
  { id: "min", test: (p) => p.length >= 8 },
  { id: "upper", test: (p) => /[A-Z]/.test(p) },
  { id: "number", test: (p) => /[0-9]/.test(p) },
  { id: "special", test: (p) => /[^a-zA-Z0-9]/.test(p) },
];

export function isStrongPassword(password: string): boolean {
  return passwordRules.every((r) => r.test(password));
}
