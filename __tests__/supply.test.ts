/**
 * Unit tests for estimateDaysOfSupply (F1: refill/renewal).
 */
import { estimateDaysOfSupply } from "../src/utils";
import { Medication, Schedule } from "../src/types";

const med = (over: Partial<Medication> = {}): Medication => ({
  id: "m1",
  name: "Test",
  dosageAmount: 1,
  dosageUnit: "comprimidos",
  dosage: "1 comprimidos",
  category: "otro",
  color: "blue",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  stockQuantity: 14,
  ...over,
});

const sched = (over: Partial<Schedule> = {}): Schedule => ({
  id: "s1",
  medicationId: "m1",
  time: "08:00",
  days: [],
  isActive: true,
  ...over,
});

describe("estimateDaysOfSupply", () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 9, 0, 0, 0)); });
  afterAll(() => jest.useRealTimers());
  it("daily single dose: qty 14 → 14 days", () => {
    expect(estimateDaysOfSupply(med(), [sched()])).toBe(14);
  });

  it("two doses per day: qty 14 → 7 days", () => {
    expect(
      estimateDaysOfSupply(med(), [sched(), sched({ id: "s2", time: "20:00" })])
    ).toBe(7);
  });

  it("three days a week: qty 6 → 14 days", () => {
    expect(
      estimateDaysOfSupply(med({ stockQuantity: 6 }), [sched({ days: [1, 3, 5] })])
    ).toBe(14);
  });

  it("returns null without stock tracking", () => {
    expect(estimateDaysOfSupply(med({ stockQuantity: undefined }), [sched()])).toBeNull();
  });

  it("returns null for PRN meds", () => {
    expect(estimateDaysOfSupply(med({ isPRN: true }), [sched()])).toBeNull();
  });

  it("returns null with no active schedules", () => {
    expect(estimateDaysOfSupply(med(), [sched({ isActive: false })])).toBeNull();
    expect(estimateDaysOfSupply(med(), [])).toBeNull();
  });

  it("ignores schedules of other medications", () => {
    expect(
      estimateDaysOfSupply(med(), [sched({ medicationId: "other" })])
    ).toBeNull();
  });
});

// Exact regimen days determine coverage; the reference date is deliberately fixed.
describe("regimen-aware stock coverage", () => {
  const reference = new Date(2026, 9, 9, 0, 0, 0);
  it("covers rest days in an every-N-days regimen", () => {
    expect(estimateDaysOfSupply(med({ stockQuantity: 2, startDate: "2026-10-09", regimen: JSON.stringify({ type: "everyN", n: 3 }) }), [sched()], reference)).toBe(6);
  });
  it("does not suggest a refill when the remaining treatment is covered", () => {
    expect(estimateDaysOfSupply(med({ stockQuantity: 2, startDate: "2026-10-09", endDate: "2026-10-10" }), [sched()], reference)).toBeNull();
  });
  it("reports an empty inventory without multiplying by dosage amount", () => {
    expect(estimateDaysOfSupply(med({ stockQuantity: 0, dosageAmount: 500, dosageUnit: "mg" }), [sched()], reference)).toBe(0);
  });
});
