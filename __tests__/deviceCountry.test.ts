/**
 * Region auto-detection — specifically the timezone fallback, which is the
 * signal that rescues es-419 users whose locale carries no region.
 */
import { getDrugRegion } from "../src/services/deviceCountry";

const setZone = (tz: string) => {
  jest.spyOn(Intl, "DateTimeFormat").mockReturnValue({
    resolvedOptions: () => ({ timeZone: tz }),
  } as unknown as Intl.DateTimeFormat);
};

jest.mock("expo-localization", () => ({ getLocales: () => [{ regionCode: null }] }));

describe("timezone fallback", () => {
  afterEach(() => jest.restoreAllMocks());

  it("resolves the canonical Argentine zone", () => {
    setZone("America/Argentina/Buenos_Aires");
    expect(getDrugRegion()).toBe("AR");
  });

  it("resolves the legacy alias devices still report", () => {
    // Pre-2017 name; absent from the IANA table, so it used to resolve to the
    // default catalog for the very users the fallback targets.
    setZone("America/Buenos_Aires");
    expect(getDrugRegion()).toBe("AR");
    setZone("America/Mendoza");
    expect(getDrugRegion()).toBe("AR");
  });

  it("resolves other common legacy aliases", () => {
    setZone("Asia/Calcutta");
    expect(getDrugRegion()).toBe("IN");
    setZone("Europe/Kiev");
    expect(getDrugRegion()).toBe("UA");
  });

  it("returns null for an unknown zone rather than guessing", () => {
    setZone("Mars/Olympus_Mons");
    expect(getDrugRegion()).toBeNull();
  });
});

describe("SIM country placeholders (iOS 16.4+ reports \"--\")", () => {
  // Fresh module registry per test so the SIM mock and the cached value are
  // seen by the same deviceCountry/storage instances.
  const load = (sim: string | null, cached?: string) => {
    jest.resetModules();
    jest.doMock("expo-cellular", () => ({
      getIsoCountryCodeAsync: jest.fn().mockResolvedValue(sim),
    }));
    jest.doMock("expo-localization", () => ({ getLocales: () => [{ regionCode: null }] }));
    const { storage } = require("../src/storage");
    const { STORAGE_KEYS } = require("../src/config");
    if (cached) storage.set(STORAGE_KEYS.SIM_COUNTRY, cached);
    else storage.remove(STORAGE_KEYS.SIM_COUNTRY);
    return require("../src/services/deviceCountry");
  };

  beforeEach(() => setZone("America/Argentina/Buenos_Aires"));
  afterEach(() => jest.restoreAllMocks());

  it("ignores \"--\" from the SIM and falls back to the timezone", async () => {
    const mod = load("--");
    await mod.refreshSimCountry();
    expect(mod.getDrugRegion()).toBe("AR");
  });

  it("drops a \"--\" cached by an older build", () => {
    expect(load(null, "--").getDrugRegion()).toBe("AR");
  });

  it("clears a cached country once the SIM starts reporting \"--\"", async () => {
    const mod = load("--", "US");
    expect(mod.getDrugRegion()).toBe("US");
    await mod.refreshSimCountry();
    expect(mod.getDrugRegion()).toBe("AR");
  });

  it("still prefers a real SIM country over the timezone", async () => {
    const mod = load("us");
    await mod.refreshSimCountry();
    expect(mod.getDrugRegion()).toBe("US");
  });
});
