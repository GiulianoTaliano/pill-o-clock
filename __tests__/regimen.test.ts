/**
 * Complex regimens (F3): everyN / cycle / taper date math and the
 * isScheduleActiveOnDate integration.
 */
import {
  parseRegimen,
  isRegimenActiveOnDate,
  effectiveAmountForDate,
  withEffectiveDose,
  buildRegimenJson,
} from "../src/services/regimen";
import { isScheduleActiveOnDate } from "../src/utils";
import { makeMedication, makeSchedule } from "./factories";

const med = (regimen: object | null, startDate = "2026-07-01") =>
  makeMedication({
    regimen: regimen ? JSON.stringify(regimen) : undefined,
    startDate,
    createdAt: "2026-06-01T00:00:00.000Z",
  });

describe("parseRegimen", () => {
  it("accepts the three valid shapes", () => {
    expect(parseRegimen(med({ type: "everyN", n: 2 }))).toEqual({ type: "everyN", n: 2 });
    expect(parseRegimen(med({ type: "cycle", on: 21, off: 7 }))).toEqual({ type: "cycle", on: 21, off: 7 });
    expect(parseRegimen(med({ type: "taper", steps: [{ days: 7, amount: 40 }] }))).toEqual({
      type: "taper",
      steps: [{ days: 7, amount: 40 }],
    });
  });

  it("rejects malformed shapes (fail open = no regimen)", () => {
    expect(parseRegimen(med(null))).toBeNull();
    expect(parseRegimen(med({ type: "everyN", n: 1 }))).toBeNull();
    expect(parseRegimen(med({ type: "cycle", on: 0, off: 7 }))).toBeNull();
    expect(parseRegimen(med({ type: "taper", steps: [] }))).toBeNull();
    expect(parseRegimen({ regimen: "not-json" })).toBeNull();
  });
});

describe("isRegimenActiveOnDate", () => {
  it("everyN: active on anchor, anchor+N, ...", () => {
    const m = med({ type: "everyN", n: 3 });
    expect(isRegimenActiveOnDate(m, "2026-07-01")).toBe(true);
    expect(isRegimenActiveOnDate(m, "2026-07-02")).toBe(false);
    expect(isRegimenActiveOnDate(m, "2026-07-04")).toBe(true);
    expect(isRegimenActiveOnDate(m, "2026-06-30")).toBe(false); // before anchor
  });

  it("cycle 21/7: on the first 21 days of each 28-day block", () => {
    const m = med({ type: "cycle", on: 21, off: 7 });
    expect(isRegimenActiveOnDate(m, "2026-07-01")).toBe(true);  // day 0
    expect(isRegimenActiveOnDate(m, "2026-07-21")).toBe(true);  // day 20
    expect(isRegimenActiveOnDate(m, "2026-07-22")).toBe(false); // day 21 (off)
    expect(isRegimenActiveOnDate(m, "2026-07-28")).toBe(false); // day 27 (off)
    expect(isRegimenActiveOnDate(m, "2026-07-29")).toBe(true);  // day 28 → new block
  });

  it("taper: active during the steps, over afterwards", () => {
    const m = med({ type: "taper", steps: [{ days: 7, amount: 40 }, { days: 7, amount: 20 }] });
    expect(isRegimenActiveOnDate(m, "2026-07-01")).toBe(true);  // day 0
    expect(isRegimenActiveOnDate(m, "2026-07-14")).toBe(true);  // day 13 (last)
    expect(isRegimenActiveOnDate(m, "2026-07-15")).toBe(false); // day 14 → done
  });

  it("no regimen → always active (existing behavior)", () => {
    expect(isRegimenActiveOnDate(med(null), "2026-07-10")).toBe(true);
  });
});

describe("effectiveAmountForDate / withEffectiveDose", () => {
  const taper = med({ type: "taper", steps: [{ days: 7, amount: 40 }, { days: 7, amount: 20 }] });

  it("resolves the step dose by date", () => {
    expect(effectiveAmountForDate(taper, "2026-07-03")).toBe(40); // step 1
    expect(effectiveAmountForDate(taper, "2026-07-08")).toBe(20); // step 2
    expect(effectiveAmountForDate(taper, "2026-07-20")).toBeNull(); // over
  });

  it("non-taper meds keep their dose", () => {
    const m = med({ type: "everyN", n: 2 });
    expect(effectiveAmountForDate(m, "2026-07-05")).toBe(m.dosageAmount);
  });

  it("withEffectiveDose substitutes dose and dosage string, same object otherwise", () => {
    const eff = withEffectiveDose(taper, "2026-07-08");
    expect(eff.dosageAmount).toBe(20);
    expect(eff.dosage).toBe(`20 ${taper.dosageUnit}`);
    const plain = makeMedication({});
    expect(withEffectiveDose(plain, "2026-07-08")).toBe(plain);
  });
});

describe("isScheduleActiveOnDate integration", () => {
  it("gates the schedule through the regimen window", () => {
    const m = med({ type: "everyN", n: 2 });
    const s = makeSchedule({ medicationId: m.id, days: [] });
    expect(isScheduleActiveOnDate(s, new Date(2026, 6, 1, 12), m)).toBe(true);  // day 0
    expect(isScheduleActiveOnDate(s, new Date(2026, 6, 2, 12), m)).toBe(false); // day 1
    expect(isScheduleActiveOnDate(s, new Date(2026, 6, 3, 12), m)).toBe(true);  // day 2
  });

  it("round-trips through buildRegimenJson", () => {
    const json = buildRegimenJson({ type: "cycle", on: 5, off: 2 })!;
    const m = med(null);
    const withReg = { ...m, regimen: json };
    expect(isRegimenActiveOnDate(withReg, "2026-07-05")).toBe(true);  // day 4 (on)
    expect(isRegimenActiveOnDate(withReg, "2026-07-06")).toBe(false); // day 5 (off)
  });
});
