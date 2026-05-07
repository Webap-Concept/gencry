// Modes condivisi tra server action e client form. NON deve stare in
// `actions.ts` con `"use server"`: in quel file ogni export non-async-function
// viene trasformato da Next.js, e un array importato dal client diventa un
// oggetto opaco (sintomo: `m.map is not a function`).

export const MFA_MODES = [
  "optional",
  "required-for-staff",
  "required-for-all",
] as const;

export type MfaMode = (typeof MFA_MODES)[number];

export function isMfaMode(v: string): v is MfaMode {
  return (MFA_MODES as readonly string[]).includes(v);
}
