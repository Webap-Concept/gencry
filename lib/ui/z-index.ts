// lib/ui/z-index.ts
//
// Scala z-index del progetto. SOURCE OF TRUTH per il layering.
//
// I componenti applicano la classe Tailwind corrispondente (commento
// accanto a ogni costante). Le costanti TS servono per documentazione e
// per i casi rari dove serve `style={{ zIndex: Z.XXX }}` (componenti
// che ricevono z come prop o usano CSS variables).
//
// Vincolo esterno: shadcn Sheet/Dialog/Tooltip usa z-50 hardcoded nel
// suo CSS — la nostra scala si allinea a quello come "MODAL" layer.
// Tutto ciò che deve stare SOPRA un modal (toast) va a 60+; tutto
// ciò che deve stare SOTTO (topbar, bottomnav, sidebar) va a <50.

export const Z = {
  /** Contenuto in normal flow. Tailwind: `z-0` (default). */
  BASE: 0,
  /** Sticky elementi dentro scroll container (table header, ecc.). Tailwind: `z-10`. */
  STICKY: 10,
  /** Sidebar fissa, popover utente desktop. Tailwind: `z-20`. */
  SHELL: 20,
  /** Mobile TopBar e BottomNav. Sotto i modali. Tailwind: `z-30`. */
  NAV: 30,
  /** Banner annunci (re-consent, system messages). Sopra la nav ma sotto i modali. Tailwind: `z-40`. */
  BANNER: 40,
  /** Modal / Drawer / Dialog (shadcn Sheet default). Tailwind: `z-50`. */
  MODAL: 50,
  /** Toast / snackbar — sopra TUTTO incluso modal. Tailwind: `z-[60]`. */
  TOAST: 60,
} as const;

export type ZLayer = (typeof Z)[keyof typeof Z];
