import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock di `getAppSettings` PRIMA dell'import del modulo sotto test:
// vi.mock viene hoisted al top, così quando `lib/home/gates.ts` viene
// importato sotto, riceve la versione mock.
vi.mock("@/lib/db/settings-queries", () => ({
  getAppSettings: vi.fn(),
}));

import { getAppSettings } from "@/lib/db/settings-queries";
import { isDisabledByFlag, isEnabledByFlag } from "@/lib/home/gates";

const mockedGetAppSettings = vi.mocked(getAppSettings);

beforeEach(() => {
  mockedGetAppSettings.mockReset();
});

describe("isEnabledByFlag", () => {
  it("returns true when the setting equals 'true'", async () => {
    mockedGetAppSettings.mockResolvedValue({
      "modules.prices.coingecko_pro_enabled": "true",
    } as never);

    const gate = isEnabledByFlag("modules.prices.coingecko_pro_enabled");
    await expect(gate()).resolves.toBe(true);
  });

  it("returns false when the setting equals 'false'", async () => {
    mockedGetAppSettings.mockResolvedValue({
      "modules.prices.coingecko_pro_enabled": "false",
    } as never);

    const gate = isEnabledByFlag("modules.prices.coingecko_pro_enabled");
    await expect(gate()).resolves.toBe(false);
  });

  it("returns false when the setting is null", async () => {
    mockedGetAppSettings.mockResolvedValue({
      "modules.prices.coingecko_pro_enabled": null,
    } as never);

    const gate = isEnabledByFlag("modules.prices.coingecko_pro_enabled");
    await expect(gate()).resolves.toBe(false);
  });

  it("returns false for any non-'true' value (string casting safety)", async () => {
    mockedGetAppSettings.mockResolvedValue({
      "modules.prices.coingecko_pro_enabled": "yes",
    } as never);

    const gate = isEnabledByFlag("modules.prices.coingecko_pro_enabled");
    await expect(gate()).resolves.toBe(false);
  });
});

describe("isDisabledByFlag", () => {
  it("returns true when the setting is NOT 'true'", async () => {
    mockedGetAppSettings.mockResolvedValue({
      "modules.prices.coingecko_pro_enabled": "false",
    } as never);

    const gate = isDisabledByFlag("modules.prices.coingecko_pro_enabled");
    await expect(gate()).resolves.toBe(true);
  });

  it("returns false when the setting equals 'true'", async () => {
    mockedGetAppSettings.mockResolvedValue({
      "modules.prices.coingecko_pro_enabled": "true",
    } as never);

    const gate = isDisabledByFlag("modules.prices.coingecko_pro_enabled");
    await expect(gate()).resolves.toBe(false);
  });
});
