import {
  generateId,
  today,
  toDateString,
  toISOString,
  parseTime,
  isScheduleActiveOnDate,
} from "../src/utils";
import type { Schedule, Medication } from "../src/types";

// ─── Helper factories ──────────────────────────────────────────────────────

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Test Med",
    dosageAmount: 500,
    dosageUnit: "mg",
    dosage: "500 mg",
    category: "otro",
    color: "blue",
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sch-1",
    medicationId: "med-1",
    time: "08:00",
    days: [],
    isActive: true,
    ...overrides,
  };
}

// ─── generateId ────────────────────────────────────────────────────────────

describe("generateId", () => {
  it("returns a string", () => {
    expect(typeof generateId()).toBe("string");
  });

  it("returns unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });

  it("matches UUID v4 format", () => {
    const uuid = generateId();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

// ─── today / toDateString / toISOString ────────────────────────────────────

describe("today", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toDateString", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(toDateString(new Date(2025, 5, 15))).toBe("2025-06-15");
  });
});

describe("toISOString", () => {
  it("returns an ISO 8601 string", () => {
    const d = new Date("2025-06-15T10:30:00Z");
    expect(toISOString(d)).toBe(d.toISOString());
  });
});

// ─── parseTime ─────────────────────────────────────────────────────────────

describe("parseTime", () => {
  it("parses HH:mm into hours and minutes", () => {
    expect(parseTime("08:30")).toEqual({ hours: 8, minutes: 30 });
  });

  it("parses midnight", () => {
    expect(parseTime("00:00")).toEqual({ hours: 0, minutes: 0 });
  });

  it("parses 23:59", () => {
    expect(parseTime("23:59")).toEqual({ hours: 23, minutes: 59 });
  });
});

// ─── isScheduleActiveOnDate ────────────────────────────────────────────────

describe("isScheduleActiveOnDate", () => {
  const monday = new Date("2025-06-16T12:00:00"); // Monday

  it("returns true for an active daily schedule", () => {
    const schedule = makeSchedule();
    const med = makeMedication();
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(true);
  });

  it("returns false when schedule is inactive", () => {
    const schedule = makeSchedule({ isActive: false });
    const med = makeMedication();
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(false);
  });

  it("returns false when medication is inactive", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ isActive: false });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(false);
  });

  it("returns false for a date before medication createdAt", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ createdAt: "2025-07-01T00:00:00.000Z" });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(false);
  });

  it("returns false for a date before medication startDate", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ startDate: "2025-07-01" });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(false);
  });

  it("returns false for a date after medication endDate", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ endDate: "2025-06-01" });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(false);
  });

  it("returns true within the start/end range", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ startDate: "2025-06-01", endDate: "2025-06-30" });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(true);
  });

  it("returns true when date matches a specific day in the schedule", () => {
    // Monday = day 1
    const schedule = makeSchedule({ days: [1, 3, 5] });
    const med = makeMedication();
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(true);
  });

  it("returns false when date does not match specific days", () => {
    // Monday = day 1, schedule only on Wed(3) and Fri(5)
    const schedule = makeSchedule({ days: [3, 5] });
    const med = makeMedication();
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(false);
  });

  it("handles Sunday (day 0) correctly", () => {
    const sunday = new Date("2025-06-15T12:00:00"); // Sunday
    const schedule = makeSchedule({ days: [0] });
    const med = makeMedication();
    expect(isScheduleActiveOnDate(schedule, sunday, med)).toBe(true);
  });

  it("handles Saturday (day 6) correctly", () => {
    const saturday = new Date("2025-06-14T12:00:00"); // Saturday
    const schedule = makeSchedule({ days: [6] });
    const med = makeMedication();
    expect(isScheduleActiveOnDate(schedule, saturday, med)).toBe(true);
  });

  it("returns true on exact startDate boundary", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ startDate: "2025-06-16" });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(true);
  });

  it("returns true on exact endDate boundary", () => {
    const schedule = makeSchedule();
    const med = makeMedication({ endDate: "2025-06-16" });
    expect(isScheduleActiveOnDate(schedule, monday, med)).toBe(true);
  });
});
