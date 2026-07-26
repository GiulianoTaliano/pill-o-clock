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
