/**
 * Unit tests for the caregiver-snapshot pure core (F2).
 */
import { computeCaregiverSnapshot, buildSnapshotHtml } from "../src/services/caregiverSnapshot";
import { initI18n } from "../src/i18n";
import { Medication, Schedule, DoseLog } from "../src/types";

jest.mock("../src/db/database", () => ({
  getMedications: jest.fn(),
  getSchedulesByMedication: jest.fn(),
  getDoseLogsByDateRange: jest.fn(),
}));
jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "es" }],
}));

beforeAll(() => initI18n());

const med = (over: Partial<Medication>): Medication => ({
  id: "m1",
  name: "Ibuprofeno",
  dosageAmount: 400,
  dosageUnit: "mg",
  dosage: "400 mg",
  category: "analgesico",
  color: "blue",
  isActive: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

const sched = (over: Partial<Schedule>): Schedule => ({
  id: "s1",
  medicationId: "m1",
  time: "08:00",
  days: [],
  isActive: true,
  ...over,
});

const log = (over: Partial<DoseLog>): DoseLog => ({
  id: "l1",
  medicationId: "m1",
  scheduleId: "s1",
  scheduledDate: "2026-07-22",
  scheduledTime: "08:00",
  status: "taken",
  createdAt: "2026-07-22T08:00:00.000Z",
  ...over,
});

// A Wednesday (getDay() = 3), local time.
const NOW = new Date(2026, 6, 22, 12, 0, 0);

describe("computeCaregiverSnapshot", () => {
  it("splits regular and PRN meds, ignoring inactive ones", () => {
    const snap = computeCaregiverSnapshot(
      [med({}), med({ id: "m2", isPRN: true }), med({ id: "m3", isActive: false })],
      new Map([["m1", [sched({})]]]),
      [],
      NOW
    );
    expect(snap.regular).toHaveLength(1);
    expect(snap.prn).toHaveLength(1);
    expect(snap.prn[0].med.id).toBe("m2");
  });

  it("marks today's doses with their logged status", () => {
    const snap = computeCaregiverSnapshot(
      [med({})],
      new Map([["m1", [sched({}), sched({ id: "s2", time: "20:00" })]]]),
      [log({})],
      NOW
    );
    expect(snap.regular[0].today).toEqual([
      { time: "08:00", status: "taken" },
      { time: "20:00", status: "unlogged" },
    ]);
  });

  it("excludes schedules that don't run today", () => {
    // NOW is a Wednesday (3); schedule only Mondays (1).
    const snap = computeCaregiverSnapshot(
      [med({})],
      new Map([["m1", [sched({ days: [1] })]]]),
      [],
      NOW
    );
    expect(snap.regular[0].today).toEqual([]);
    expect(snap.regular[0].schedules).toEqual([{ time: "08:00", days: [1] }]);
  });

  it("computes 7-day adherence only with enough settled logs", () => {
    const few = computeCaregiverSnapshot(
      [med({})],
      new Map([["m1", [sched({})]]]),
      [log({}), log({ id: "l2", scheduledDate: "2026-07-21" })],
      NOW
    );
    expect(few.regular[0].adherence7d).toBeNull();

    const enough = computeCaregiverSnapshot(
      [med({})],
      new Map([["m1", [sched({})]]]),
      [
        log({}),
        log({ id: "l2", scheduledDate: "2026-07-21" }),
        log({ id: "l3", scheduledDate: "2026-07-20", status: "missed" }),
        log({ id: "l4", scheduledDate: "2026-07-19", status: "pending" }),
      ],
      NOW
    );
    // 2 taken / 3 settled (pending excluded).
    expect(enough.regular[0].adherence7d).toBeCloseTo(2 / 3);
  });

  it("flags low stock only when at or below the threshold", () => {
    const snap = computeCaregiverSnapshot(
      [
        med({ stockQuantity: 3, stockAlertThreshold: 5 }),
        med({ id: "m2", stockQuantity: 30, stockAlertThreshold: 5 }),
      ],
      new Map(),
      [],
      NOW
    );
    expect(snap.regular[0].lowStock).toBe(true);
    expect(snap.regular[1].lowStock).toBe(false);
  });
});

describe("buildSnapshotHtml", () => {
  it("renders med names and escapes HTML in user text", () => {
    const snap = computeCaregiverSnapshot(
      [med({ notes: "con <comida> & agua" })],
      new Map([["m1", [sched({})]]]),
      [],
      NOW
    );
    const html = buildSnapshotHtml(snap);
    expect(html).toContain("Ibuprofeno");
    expect(html).toContain("con &lt;comida&gt; &amp; agua");
    expect(html).not.toContain("<comida>");
  });

  it("renders the PRN section with configured limits", () => {
    const snap = computeCaregiverSnapshot(
      [med({ isPRN: true, prnMaxPerDay: 3, prnMinIntervalMinutes: 240 })],
      new Map(),
      [],
      NOW
    );
    const html = buildSnapshotHtml(snap);
    expect(html).toContain("3");
    expect(html).toContain("240");
  });
});
