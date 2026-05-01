// lib/account/password-rules.ts
//
// Regole di forza password — usate sia client (indicatori live nei form)
// sia server (validazione in changePassword). File puro: nessuna dipendenza
// server-only così può essere importato anche da Client Component.

export type PasswordRuleId = "min" | "upper" | "number" | "special";

export const passwordRules: Array<{
  id: PasswordRuleId;
  label: string;
  test: (p: string) => boolean;
}> = [
  { id: "min", label: "Almeno 8 caratteri", test: (p) => p.length >= 8 },
  { id: "upper", label: "Una lettera maiuscola", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "Un numero", test: (p) => /[0-9]/.test(p) },
  {
    id: "special",
    label: "Un carattere speciale",
    test: (p) => /[^a-zA-Z0-9]/.test(p),
  },
];

export function isStrongPassword(password: string): boolean {
  return passwordRules.every((r) => r.test(password));
}
