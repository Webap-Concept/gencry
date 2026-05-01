// lib/account/parse-user-agent.ts
//
// Parser User-Agent minimale: niente dipendenze esterne, mira a fornire una
// descrizione human-readable del dispositivo (browser + OS + tipo) sufficiente
// per la UI di gestione "dispositivi fidati". Non è un parser completo: copre
// i casi mainstream (~95% del traffico reale).

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type ParsedUserAgent = {
  browser: string;
  os: string;
  deviceType: DeviceType;
  /** Etichetta sintetica pronta per UI, es. "Chrome su macOS". */
  label: string;
};

const UNKNOWN: ParsedUserAgent = {
  browser: "Browser sconosciuto",
  os: "Sistema sconosciuto",
  deviceType: "unknown",
  label: "Dispositivo sconosciuto",
};

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return UNKNOWN;

  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const deviceType = detectDeviceType(ua);

  return {
    browser,
    os,
    deviceType,
    label: `${browser} su ${os}`,
  };
}

function detectBrowser(ua: string): string {
  // L'ordine conta: Edge/Opera/Brave includono "Chrome" nello UA, vanno
  // matchati prima.
  if (/\bEdg\//i.test(ua)) return "Edge";
  if (/\bOPR\/|\bOpera\//i.test(ua)) return "Opera";
  if (/\bBrave\//i.test(ua)) return "Brave";
  if (/\bFirefox\//i.test(ua)) return "Firefox";
  if (/\bChrome\//i.test(ua) && !/\bChromium\//i.test(ua)) return "Chrome";
  if (/\bChromium\//i.test(ua)) return "Chromium";
  if (/\bSafari\//i.test(ua) && /\bVersion\//i.test(ua)) return "Safari";
  return "Browser sconosciuto";
}

function detectOs(ua: string): string {
  if (/\bWindows NT 10\.0/i.test(ua)) return "Windows 10/11";
  if (/\bWindows NT/i.test(ua)) return "Windows";
  if (/\bMac OS X|\bMacintosh/i.test(ua) && !/\biPhone|\biPad/i.test(ua))
    return "macOS";
  if (/\biPhone\b/i.test(ua)) return "iPhone";
  if (/\biPad\b/i.test(ua)) return "iPad";
  if (/\bAndroid\b/i.test(ua)) return "Android";
  if (/\bCrOS\b/i.test(ua)) return "ChromeOS";
  if (/\bLinux\b/i.test(ua)) return "Linux";
  return "Sistema sconosciuto";
}

function detectDeviceType(ua: string): DeviceType {
  if (/\biPad\b/i.test(ua)) return "tablet";
  if (/\bTablet\b/i.test(ua) && /\bAndroid\b/i.test(ua)) return "tablet";
  if (/\bAndroid\b/i.test(ua) && /\bMobile\b/i.test(ua)) return "mobile";
  if (/\biPhone\b/i.test(ua)) return "mobile";
  if (/\bMobile\b/i.test(ua)) return "mobile";
  if (/\bWindows|\bMacintosh|\bLinux|\bCrOS\b/i.test(ua)) return "desktop";
  return "unknown";
}
