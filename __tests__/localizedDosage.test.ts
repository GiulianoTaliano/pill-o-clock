/**
 * Long-form dosage pluralization + profile attribution (emulator findings
 * on 1.7.0/vc24): the alarm co-due row and the emergency card rendered the
 * raw `dosage` string ("1 comprimidos"), and the alarm screen never said
 * WHOSE dose was ringing on multi-profile devices.
 */
import i18n, { initI18n } from "../src/i18n";
import { getLocalizedDosageLong, getProfileLabel } from "../src/utils";
import type { DosageUnit } from "../src/types";

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "es" }],
}));

beforeAll(() => initI18n());

const t = ((key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)) as any;

const med = (dosageAmount: number, dosageUnit: DosageUnit) => ({ dosageAmount, dosageUnit });

// ─── getLocalizedDosageLong ────────────────────────────────────────────────

describe("getLocalizedDosageLong", () => {
  it("pluralizes countable units in Spanish", async () => {
    await i18n.changeLanguage("es");
    expect(getLocalizedDosageLong(med(1, "comprimidos"), t)).toBe("1 comprimido");
    expect(getLocalizedDosageLong(med(2, "comprimidos"), t)).toBe("2 comprimidos");
    expect(getLocalizedDosageLong(med(1, "gotas"), t)).toBe("1 gota");
    expect(getLocalizedDosageLong(med(3, "gotas"), t)).toBe("3 gotas");
    expect(getLocalizedDosageLong(med(1, "capsulas"), t)).toBe("1 cápsula");
    expect(getLocalizedDosageLong(med(2, "capsulas"), t)).toBe("2 cápsulas");
  });

  it("pluralizes countable units in Portuguese", async () => {
    await i18n.changeLanguage("pt");
    expect(getLocalizedDosageLong(med(1, "comprimidos"), t)).toBe("1 comprimido");
    expect(getLocalizedDosageLong(med(3, "comprimidos"), t)).toBe("3 comprimidos");
    expect(getLocalizedDosageLong(med(1, "gotas"), t)).toBe("1 gota");
    expect(getLocalizedDosageLong(med(1, "capsulas"), t)).toBe("1 cápsula");
  });

  it("pluralizes countable units in English", async () => {
    await i18n.changeLanguage("en");
    expect(getLocalizedDosageLong(med(1, "comprimidos"), t)).toBe("1 tablet");
    expect(getLocalizedDosageLong(med(2, "comprimidos"), t)).toBe("2 tablets");
    expect(getLocalizedDosageLong(med(1, "gotas"), t)).toBe("1 drop");
    expect(getLocalizedDosageLong(med(1, "capsulas"), t)).toBe("1 capsule");
  });

  it("passes metric units through untranslated", async () => {
    await i18n.changeLanguage("es");
    expect(getLocalizedDosageLong(med(500, "mg"), t)).toBe("500 mg");
    expect(getLocalizedDosageLong(med(10, "ml"), t)).toBe("10 ml");
    expect(getLocalizedDosageLong(med(1000, "UI"), t)).toBe("1000 UI");
  });
});

// ─── getProfileLabel ───────────────────────────────────────────────────────

describe("getProfileLabel", () => {
  const multi = [
    { id: "default", name: "" },
    { id: "p2", name: "Mamá" },
  ];

  it("returns null with a single profile (no ambiguity)", () => {
    expect(getProfileLabel({ profileId: "p2" }, [{ id: "p2", name: "Mamá" }], t)).toBeNull();
  });

  it("returns the owner's name with multiple profiles", () => {
    expect(getProfileLabel({ profileId: "p2" }, multi, t)).toBe("Mamá");
  });

  it("falls back to localized 'Me' for the unnamed default profile", async () => {
    await i18n.changeLanguage("es");
    expect(getProfileLabel({ profileId: "default" }, multi, t)).toBe("Yo");
  });

  it("treats a med without profileId as owned by 'default'", async () => {
    await i18n.changeLanguage("es");
    expect(getProfileLabel({}, multi, t)).toBe("Yo");
  });

  it("returns null when the owning profile no longer exists", () => {
    expect(getProfileLabel({ profileId: "ghost" }, multi, t)).toBeNull();
  });
});
