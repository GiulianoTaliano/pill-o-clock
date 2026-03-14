import {
  generateId,
  today,
  toDateString,
  toISOString,
  parseTime,
  isScheduleActiveOnDate,
  getNextDates,
  getColorConfig,
  MEDICATION_COLORS,
  getDayNamesShort,
  getDayNamesFull,
  getCategoryLabel,
  getDosageLabel,
} from "../src/utils";
import { makeMedication, makeSchedule } from "./factories";

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

// ─── getNextDates ──────────────────────────────────────────────────────────

describe("getNextDates", () => {
  it("returns an array of the requested length", () => {
    expect(getNextDates(5)).toHaveLength(5);
  });

  it("returns an empty array for n=0", () => {
    expect(getNextDates(0)).toHaveLength(0);
  });

  it("first entry is today at midnight (startOfDay)", () => {
    const [first] = getNextDates(1);
    const now = new Date();
    expect(first.getFullYear()).toBe(now.getFullYear());
    expect(first.getMonth()).toBe(now.getMonth());
    expect(first.getDate()).toBe(now.getDate());
    expect(first.getHours()).toBe(0);
  });

  it("consecutive entries are exactly one day apart", () => {
    const dates = getNextDates(4);
    for (let i = 1; i < dates.length; i++) {
      const diffMs = dates[i].getTime() - dates[i - 1].getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });
});

// ─── getColorConfig — preset colors ───────────────────────────────────────

describe("getColorConfig — preset colors", () => {
  it("returns the expected config for each preset color", () => {
    Object.entries(MEDICATION_COLORS).forEach(([name, expected]) => {
      const config = getColorConfig(name);
      expect(config.bg).toBe(expected.bg);
      expect(config.light).toBe(expected.light);
      expect(config.text).toBe(expected.text);
      expect(config.border).toBe(expected.border);
    });
  });
});

// ─── getColorConfig — custom hex ───────────────────────────────────────────

describe("getColorConfig — custom hex colors", () => {
  it("returns bg equal to the hex string passed in", () => {
    const config = getColorConfig("#4f46e5");
    expect(config.bg).toBe("#4f46e5");
  });

  it("derives a light variant containing the original hex", () => {
    const config = getColorConfig("#ff0000");
    expect(config.light).toContain("#ff0000");
  });

  it("derives a border variant containing the original hex", () => {
    const config = getColorConfig("#00ff00");
    expect(config.border).toContain("#00ff00");
  });

  it("derives a darker text color (starts with #)", () => {
    const config = getColorConfig("#ff8800");
    expect(config.text).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// ─── getDayNamesShort / getDayNamesFull ────────────────────────────────────

describe("getDayNamesShort", () => {
  it("calls t with 'days.short' and returnObjects:true", () => {
    const mockT = jest.fn(() => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    getDayNamesShort(mockT as any);
    expect(mockT).toHaveBeenCalledWith("days.short", { returnObjects: true });
  });
});

describe("getDayNamesFull", () => {
  it("calls t with 'days.full' and returnObjects:true", () => {
    const mockT = jest.fn(() => []);
    getDayNamesFull(mockT as any);
    expect(mockT).toHaveBeenCalledWith("days.full", { returnObjects: true });
  });
});

// ─── getCategoryLabel ──────────────────────────────────────────────────────

describe("getCategoryLabel", () => {
  it("calls t with the correct namespaced key", () => {
    const mockT = jest.fn((key: string) => key);
    getCategoryLabel("analgesico", mockT as any);
    expect(mockT).toHaveBeenCalledWith("categories.analgesico");
  });

  it("covers all category values", () => {
    const categories = [
      "antibiotico", "analgesico", "antiinflamatorio",
      "suplemento", "vitamina", "otro",
    ] as const;
    const mockT = jest.fn((key: string) => key);
    categories.forEach((cat) => {
      getCategoryLabel(cat, mockT as any);
      expect(mockT).toHaveBeenCalledWith(`categories.${cat}`);
    });
  });
});

// ─── getDosageLabel ────────────────────────────────────────────────────────

describe("getDosageLabel", () => {
  it("returns the translated label for localized units", () => {
    const mockT = jest.fn((key: string) => `[${key}]`);
    expect(getDosageLabel("gotas", mockT as any)).toBe("[dosageUnits.gotas]");
    expect(getDosageLabel("comprimidos", mockT as any)).toBe("[dosageUnits.comprimidos]");
    expect(getDosageLabel("capsulas", mockT as any)).toBe("[dosageUnits.capsulas]");
  });

  it("falls back to the unit string for non-localized units", () => {
    const mockT = jest.fn((key: string) => key);
    expect(getDosageLabel("mg", mockT as any)).toBe("mg");
    expect(getDosageLabel("ml", mockT as any)).toBe("ml");
    expect(getDosageLabel("g", mockT as any)).toBe("g");
  });
});
