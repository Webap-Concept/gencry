import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";

// Satoshi (Fontshare) — font del brand "generazione crypto", self-hosted.
// Usiamo i due file Variable: un singolo file copre l'intero range di pesi.
export const satoshi = localFont({
  src: [
    {
      path: "./fonts/satoshi/Satoshi-Variable.woff2",
      weight: "300 900",
      style: "normal",
    },
    {
      path: "./fonts/satoshi/Satoshi-VariableItalic.woff2",
      weight: "300 900",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// Instrument Serif — font display per titoli serif italici ("Buonasera, tu").
export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
