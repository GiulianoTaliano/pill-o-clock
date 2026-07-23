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
