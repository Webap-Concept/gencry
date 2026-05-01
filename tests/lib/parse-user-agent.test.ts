import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/lib/account/parse-user-agent";

// Casi reali dai log del progetto + esemplari mainstream. Lo scopo non è
// coprire ogni UA possibile (sono migliaia) ma garantire che le combinazioni
// più viste in produzione vengano etichettate correttamente.

describe("parseUserAgent — fallback", () => {
  it("ritorna 'sconosciuto' su null/undefined/empty", () => {
    expect(parseUserAgent(null).label).toBe("Dispositivo sconosciuto");
    expect(parseUserAgent(undefined).label).toBe("Dispositivo sconosciuto");
    expect(parseUserAgent("").label).toBe("Dispositivo sconosciuto");
  });
});

describe("parseUserAgent — desktop", () => {
  it("Chrome su Windows 10/11", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const r = parseUserAgent(ua);
    expect(r.browser).toBe("Chrome");
    expect(r.os).toBe("Windows 10/11");
    expect(r.deviceType).toBe("desktop");
  });

  it("Safari su macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15";
    const r = parseUserAgent(ua);
    expect(r.browser).toBe("Safari");
    expect(r.os).toBe("macOS");
    expect(r.deviceType).toBe("desktop");
  });

  it("Edge non viene confuso con Chrome", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    expect(parseUserAgent(ua).browser).toBe("Edge");
  });

  it("Firefox su Linux", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
    const r = parseUserAgent(ua);
    expect(r.browser).toBe("Firefox");
    expect(r.os).toBe("Linux");
    expect(r.deviceType).toBe("desktop");
  });
});

describe("parseUserAgent — mobile/tablet", () => {
  it("Safari su iPhone", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("iPhone");
    expect(r.deviceType).toBe("mobile");
    expect(r.browser).toBe("Safari");
  });

  it("Chrome su Android phone", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    const r = parseUserAgent(ua);
    expect(r.browser).toBe("Chrome");
    expect(r.os).toBe("Android");
    expect(r.deviceType).toBe("mobile");
  });

  it("iPad classificato come tablet", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const r = parseUserAgent(ua);
    expect(r.os).toBe("iPad");
    expect(r.deviceType).toBe("tablet");
  });
});

describe("parseUserAgent — label", () => {
  it("compone 'Browser su OS'", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua).label).toBe("Chrome su Windows 10/11");
  });
});
