/**
 * __tests__/backgroundTask.test.ts
 *
 * P0 — closeMissedDoses: the background task that back-fills "missed" logs
 * for every schedule/date pair that had no entry in the past 30 days.
 *
 * Key assertions:
 *  - Inserts a "missed" log for every (schedule, day) with no existing log.
 *  - Skips days that already have a log (idempotent).
 *  - Respects `isScheduleActiveOnDate` (inactive meds/schedules, date bounds).
 *  - Never writes a log for today or future days.
 */

import { format, subDays, addDays } from "date-fns";
import {
  closeMissedDoses,
  registerBackgroundFetch,
  unregisterBackgroundFetch,
} from "../src/services/backgroundTask";
import { makeMedication, makeSchedule, makeDoseLog } from "./factories";

// ─── Mock external dependencies ────────────────────────────────────────────

jest.mock("../src/db/database", () => ({
  initDatabase: jest.fn().mockResolvedValue(undefined),
  getMedications: jest.fn(),
  getAllSchedules: jest.fn(),
  getDoseLogsByDateRange: jest.fn(),
  insertMissedDoseLogSafe: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/services/notifications", () => ({
  rescheduleAllNotifications: jest.fn().mockResolvedValue(undefined),
  cancelDoseNotifications: jest.fn().mockResolvedValue(undefined),
  cancelScheduleNotifications: jest.fn().mockResolvedValue(undefined),
  scheduleDoseChain: jest.fn().mockResolvedValue(undefined),
  snoozeDose: jest.fn().mockResolvedValue(undefined),
  scheduleStockAlert: jest.fn().mockResolvedValue(undefined),
  SNOOZE_MINUTES: 15,
}));

// ─── Typed references ──────────────────────────────────────────────────────

import * as db from "../src/db/database";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

// ─── Shared date constants (relative to the faked "now") ──────────────────

// Fake "now" = June 16, 2025, 10:00 AM local time
const FAKE_NOW = new Date(2025, 5, 16, 10, 0, 0, 0);
const YESTERDAY = format(subDays(FAKE_NOW, 1), "yyyy-MM-dd"); // 2025-06-15
const CUTOFF = format(subDays(FAKE_NOW, 30), "yyyy-MM-dd"); // 2025-05-17
// Days from CUTOFF to YESTERDAY (inclusive)
const EXPECTED_DAYS = 30;

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FAKE_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(db.insertMissedDoseLogSafe).mockResolvedValue(undefined);
});

// ─── Basic insertion ───────────────────────────────────────────────────────

describe("closeMissedDoses — basic insertion", () => {
  it("inserts a missed log for every day in the 30-day window", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    expect(jest.mocked(db.insertMissedDoseLogSafe)).toHaveBeenCalledTimes(EXPECTED_DAYS);
  });

  it("creates logs with status 'missed'", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    calls.forEach(([log]) => {
      expect(log.status).toBe("missed");
      expect(log.medicationId).toBe("med-1");
      expect(log.scheduleId).toBe("sch-1");
    });
  });

  it("creates logs with the schedule's time as scheduledTime", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule({ time: "14:30" })]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    calls.forEach(([log]) => {
      expect(log.scheduledTime).toBe("14:30");
    });
  });

  it("does NOT insert a log for today", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    const today = format(FAKE_NOW, "yyyy-MM-dd");
    calls.forEach(([log]) => {
      expect(log.scheduledDate).not.toBe(today);
    });
  });

  it("does NOT insert a log for future dates", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    const today = format(FAKE_NOW, "yyyy-MM-dd");
    calls.forEach(([log]) => {
      expect(log.scheduledDate <= today).toBe(true);
    });
  });

  it("covers date range from cutoff to yesterday inclusive", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const dates = jest
      .mocked(db.insertMissedDoseLogSafe)
      .mock.calls.map(([log]) => log.scheduledDate)
      .sort();

    expect(dates[0]).toBe(CUTOFF);
    expect(dates[dates.length - 1]).toBe(YESTERDAY);
  });
});

// ─── Idempotency ───────────────────────────────────────────────────────────

describe("closeMissedDoses — idempotency", () => {
  it("does not insert when all days already have a 'missed' log", async () => {
    const med = makeMedication();
    const sch = makeSchedule();

    // Build existing logs for every day in the window
    const existingLogs = Array.from({ length: EXPECTED_DAYS }, (_, i) => {
      const date = format(addDays(new Date(CUTOFF + "T00:00:00"), i), "yyyy-MM-dd");
      return makeDoseLog({ scheduleId: sch.id, scheduledDate: date, status: "missed" });
    });

    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([sch]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue(existingLogs);

    await closeMissedDoses();

    expect(jest.mocked(db.insertMissedDoseLogSafe)).not.toHaveBeenCalled();
  });

  it("only inserts logs for days that are missing", async () => {
    const med = makeMedication();
    const sch = makeSchedule();

    // Provide a log only for the first day in the range
    const existingLog = makeDoseLog({
      scheduleId: sch.id,
      scheduledDate: CUTOFF,
      status: "taken",
    });

    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([sch]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([existingLog]);

    await closeMissedDoses();

    // Should insert for all days except CUTOFF (which already has a log)
    expect(jest.mocked(db.insertMissedDoseLogSafe)).toHaveBeenCalledTimes(EXPECTED_DAYS - 1);

    const insertedDates = jest
      .mocked(db.insertMissedDoseLogSafe)
      .mock.calls.map(([log]) => log.scheduledDate);
    expect(insertedDates).not.toContain(CUTOFF);
  });
});

// ─── Inactive medications / schedules ─────────────────────────────────────

describe("closeMissedDoses — inactive medications and schedules", () => {
  it("skips days for inactive medications", async () => {
    jest
      .mocked(db.getMedications)
      .mockResolvedValue([makeMedication({ isActive: false })]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    expect(jest.mocked(db.insertMissedDoseLogSafe)).not.toHaveBeenCalled();
  });

  it("skips days for inactive schedules", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule({ isActive: false })]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    expect(jest.mocked(db.insertMissedDoseLogSafe)).not.toHaveBeenCalled();
  });

  it("produces no calls when there are no medications", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    expect(jest.mocked(db.insertMissedDoseLogSafe)).not.toHaveBeenCalled();
  });

  it("produces no calls when there are no schedules", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    expect(jest.mocked(db.insertMissedDoseLogSafe)).not.toHaveBeenCalled();
  });
});

// ─── Date-bound medications ────────────────────────────────────────────────

describe("closeMissedDoses — date-bound medications", () => {
  it("skips days before the medication's startDate", async () => {
    // Medication starts on June 1, 2025 — only June 1–15 should have logs
    const med = makeMedication({ startDate: "2025-06-01" });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    calls.forEach(([log]) => {
      expect(log.scheduledDate >= "2025-06-01").toBe(true);
    });
    // June 1 to June 15 = 15 days
    expect(calls).toHaveLength(15);
  });

  it("skips days after the medication's endDate", async () => {
    // Medication ended on May 31, 2025 — only May 17–31 should have logs
    const med = makeMedication({ endDate: "2025-05-31" });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule()]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    calls.forEach(([log]) => {
      expect(log.scheduledDate <= "2025-05-31").toBe(true);
    });
    // May 17 to May 31 = 15 days
    expect(calls).toHaveLength(15);
  });
});

// ─── Day-of-week filtering ─────────────────────────────────────────────────

describe("closeMissedDoses — day-of-week schedules", () => {
  it("only inserts logs for days that match the schedule's days array", async () => {
    // Schedule only on Mondays (1)
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllSchedules).mockResolvedValue([makeSchedule({ days: [1] })]);
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue([]);

    await closeMissedDoses();

    const calls = jest.mocked(db.insertMissedDoseLogSafe).mock.calls;
    // All inserted dates should be Mondays
    calls.forEach(([log]) => {
      const date = new Date(log.scheduledDate + "T12:00:00");
      expect(date.getDay()).toBe(1);
    });
    // From May 17 to Jun 15 (30 days starting on Saturday May 17)
    // Mondays in that range: May 19, 26; Jun 2, 9 = 4 or 5 depending on exact bounds
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.length).toBeLessThanOrEqual(5);
  });
});

// ─── registerBackgroundFetch ───────────────────────────────────────────────

describe("registerBackgroundFetch", () => {
  beforeEach(() => {
    // Each test controls these individually
    jest.mocked(BackgroundFetch.registerTaskAsync).mockResolvedValue(undefined);
  });

  it("registers the task when available and not yet registered", async () => {
    jest.mocked(BackgroundFetch.getStatusAsync).mockResolvedValue(3); // Available
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false);

    await registerBackgroundFetch();

    expect(jest.mocked(BackgroundFetch.registerTaskAsync)).toHaveBeenCalledTimes(1);
  });

  it("does not re-register when the task is already registered", async () => {
    jest.mocked(BackgroundFetch.getStatusAsync).mockResolvedValue(3);
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);

    await registerBackgroundFetch();

    expect(jest.mocked(BackgroundFetch.registerTaskAsync)).not.toHaveBeenCalled();
  });

  it("skips registration when status is Restricted", async () => {
    jest.mocked(BackgroundFetch.getStatusAsync).mockResolvedValue(1); // Restricted

    await registerBackgroundFetch();

    expect(jest.mocked(BackgroundFetch.registerTaskAsync)).not.toHaveBeenCalled();
  });

  it("skips registration when status is Denied", async () => {
    jest.mocked(BackgroundFetch.getStatusAsync).mockResolvedValue(2); // Denied

    await registerBackgroundFetch();

    expect(jest.mocked(BackgroundFetch.registerTaskAsync)).not.toHaveBeenCalled();
  });

  it("handles errors without throwing", async () => {
    jest.mocked(BackgroundFetch.getStatusAsync).mockRejectedValue(new Error("native error"));

    await expect(registerBackgroundFetch()).resolves.toBeUndefined();
  });
});

// ─── unregisterBackgroundFetch ─────────────────────────────────────────────

describe("unregisterBackgroundFetch", () => {
  it("unregisters the task when it is registered", async () => {
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true);
    jest.mocked(BackgroundFetch.unregisterTaskAsync).mockResolvedValue(undefined);

    await unregisterBackgroundFetch();

    expect(jest.mocked(BackgroundFetch.unregisterTaskAsync)).toHaveBeenCalledTimes(1);
  });

  it("does nothing when task is not registered", async () => {
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false);

    await unregisterBackgroundFetch();

    expect(jest.mocked(BackgroundFetch.unregisterTaskAsync)).not.toHaveBeenCalled();
  });

  it("handles errors without throwing", async () => {
    jest.mocked(TaskManager.isTaskRegisteredAsync).mockRejectedValue(new Error("fail"));

    await expect(unregisterBackgroundFetch()).resolves.toBeUndefined();
  });
});
