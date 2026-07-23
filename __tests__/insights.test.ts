/**
 * Unit tests for on-device adherence insights (F2).
 */
import { computeInsights } from "../src/services/insights";
import { DoseLog, Medication, DailyCheckin } from "../src/types";

let seq = 0;
const log = (
  date: string,
  time: string,
  status: DoseLog["status"],
  medicationId = "m1"
): DoseLog => ({
  id: `l${seq++}`,
  medicationId,
  scheduleId: "s1",
  scheduledDate: date,
  scheduledTime: time,
  status,
  takenAt: status === "taken" ? `${date}T${time}:00.000Z` : undefined,
  createdAt: `${date}T00:00:00.000Z`,
});

const med = (id: string, name: string): Medication => ({
  id,
  name,
  dosageAmount: 1,
  dosageUnit: "comprimidos",
  dosage: "1 comprimidos",
  category: "otro",
  color: "blue",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const checkin = (date: string, mood: 1 | 2 | 3 | 4 | 5): DailyCheckin => ({
  id: `c${seq++}`,
  date,
  mood,
  symptoms: [],
  createdAt: `${date}T00:00:00.000Z`,
});

describe("computeInsights", () => {
  it("returns nulls with insufficient history", () => {
    const r = computeInsights([log("2026-07-01", "08:00", "taken")], [], []);
    expect(r.overallRate).toBeNull();
    expect(r.worstBand).toBeNull();
  });

  it("flags the worst time band when meaningfully below overall", () => {
    const logs: DoseLog[] = [];
    // 10 morning doses all taken; 6 night doses mostly missed.
    for (let d = 1; d <= 10; d++) logs.push(log(`2026-07-${String(d).padStart(2, "0")}`, "08:00", "taken"));
    for (let d = 1; d <= 6; d++) logs.push(log(`2026-07-${String(d).padStart(2, "0")}`, "22:00", d <= 5 ? "missed" : "taken"));
    const r = computeInsights(logs, [med("m1", "A")], []);
    expect(r.worstBand?.band).toBe("night");
    expect(r.worstBand?.rate).toBeCloseTo(1 / 6, 5);
  });

  it("flags low-adherence meds under 80% with enough doses", () => {
    const logs: DoseLog[] = [];
    for (let d = 1; d <= 6; d++) logs.push(log(`2026-07-0${d}`, "08:00", d <= 3 ? "taken" : "missed", "m1"));
    for (let d = 1; d <= 6; d++) logs.push(log(`2026-07-0${d}`, "09:00", "taken", "m2"));
    const r = computeInsights(logs, [med("m1", "Flojo"), med("m2", "Bien")], []);
    expect(r.lowMeds).toHaveLength(1);
    expect(r.lowMeds[0].name).toBe("Flojo");
  });

  it("mood link requires enough days on both sides and a meaningful gap", () => {
    const logs: DoseLog[] = [];
    const checkins: DailyCheckin[] = [];
    // 5 full-adherence days (mood 4), 5 missed days (mood 2).
    for (let d = 1; d <= 5; d++) {
      const date = `2026-07-0${d}`;
      logs.push(log(date, "08:00", "taken"), log(date, "20:00", "taken"));
      checkins.push(checkin(date, 4));
    }
    for (let d = 10; d <= 14; d++) {
      const date = `2026-07-${d}`;
      logs.push(log(date, "08:00", "taken"), log(date, "20:00", "missed"));
      checkins.push(checkin(date, 2));
    }
    const r = computeInsights(logs, [med("m1", "A")], checkins);
    expect(r.mood).not.toBeNull();
    expect(r.mood!.avgFullDays).toBe(4);
    expect(r.mood!.avgMissedDays).toBe(2);
  });

  it("produces no band/weekday insight when everything is uniform", () => {
    const logs: DoseLog[] = [];
    for (let d = 1; d <= 14; d++) logs.push(log(`2026-07-${String(d).padStart(2, "0")}`, "08:00", "taken"));
    const r = computeInsights(logs, [med("m1", "A")], []);
    expect(r.overallRate).toBe(1);
    expect(r.worstBand).toBeNull();
    expect(r.worstWeekday).toBeNull();
    expect(r.lowMeds).toEqual([]);
  });
});
