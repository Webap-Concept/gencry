// lib/auth/mfa/qrcode.ts
//
// Wrapper minimal su `qrcode` per generare data-URL PNG dell'`otpauth://`
// URI. Server-side: l'`<img src={dataUrl}>` lato client non importa la
// libreria nel bundle.

import "server-only";
import { toDataURL } from "qrcode";

export async function qrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });
}
