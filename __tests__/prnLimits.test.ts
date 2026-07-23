/**
 * Unit tests for PRN safety limits (F2).
 */
import { checkPrnLimits } from "../src/services/prnLimits";
import { Medication, DoseLog } from "../src/types";

const NOW = new Date(2026, 6, 22, 14, 0, 0); // 2026-07-22 14:00 local

const med = (over: Partial<Medication> = {}): Medication => ({
  id: "m1",
  name: "Ibuprofeno",
  dosageAmount: 1,
  dosageUnit: "comprimidos",
  dosage: "1 comprimidos",
  category: "analgesico",
  color: "blue",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  isPRN: true,
  prnMaxPerDay: 3,
  prnMinIntervalMinutes: 360, // 6 h
  ...over,
});

const takenLog = (hoursAgo: number, medicationId = "m1"): DoseLog => {
  const at = new Date(NOW.getTime() - hoursAgo * 3_600_000);
  const d = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return {
    id: `l${hoursAgo}`,
    medicationId,
    scheduleId: `prn-${medicationId}-x`,
    scheduledDate: d,
    scheduledTime: "00:00",
    status: "taken",
    takenAt: at.toISOString(),
    createdAt: at.toISOString(),
  };
};

describe("checkPrnLimits", () => {
  it("passes with no logs", () => {
    const c = checkPrnLimits(med(), [], NOW);
    expect(c.blocked).toBe(false);
    expect(c.takenToday).toBe(0);
  });

  it("flags overMax when today's taken count reaches the max", () => {
    const logs = [takenLog(7), takenLog(9), takenLog(11)];
    const c = checkPrnLimits(med(), logs, NOW);
    expect(c.overMax).toBe(true);
    expect(c.blocked).toBe(true);
    expect(c.takenToday).toBe(3);
  });

  it("flags tooSoon inside the minimum interval with nextAllowedAt", () => {
    const logs = [takenLog(2)]; // 2 h ago, min interval 6 h
    const c = checkPrnLimits(med(), logs, NOW);
    expect(c.tooSoon).toBe(true);
    expect(c.blocked).toBe(true);
    expect(c.nextAllowedAt?.getTime()).toBe(
      NOW.getTime() - 2 * 3_600_000 + 6 * 3_600_000
    );
  });

  it("passes when outside the interval and under the max", () => {
    const logs = [takenLog(7)];
    const c = checkPrnLimits(med(), logs, NOW);
    expect(c.blocked).toBe(false);
  });

  it("considers yesterday's dose for the interval (cross-midnight)", () => {
    const at2am = new Date(2026, 6, 22, 2, 0, 0);
    const logs = [takenLog((NOW.getTime() - at2am.getTime()) / 3_600_000)];
    // 12h interval, last dose 02:00, now 14:00 → exactly allowed
    const c = checkPrnLimits(med({ prnMinIntervalMinutes: 720 }), logs, NOW);
    expect(c.tooSoon).toBe(false);
  });

  it("ignores other medications and non-taken logs", () => {
    const other = takenLog(1, "otherMed");
    const skipped: DoseLog = { ...takenLog(1), status: "skipped", takenAt: undefined };
    const c = checkPrnLimits(med(), [other, skipped], NOW);
    expect(c.blocked).toBe(false);
  });

  it("no limits configured → never blocks", () => {
    const c = checkPrnLimits(
      med({ prnMaxPerDay: undefined, prnMinIntervalMinutes: undefined }),
      [takenLog(0.1), takenLog(0.2), takenLog(0.3), takenLog(0.4)],
      NOW
    );
    expect(c.blocked).toBe(false);
  });
});
