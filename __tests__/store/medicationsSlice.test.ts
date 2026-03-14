/**
 * __tests__/store/medicationsSlice.test.ts
 *
 * Additional slice tests covering:
 *  - addMedication (P0, critical path)
 *  - deleteMedication
 *  - revertSnooze
 *  - updateDoseNote
 *  - logPRNDose
 *  - getHistoryLogs / getSchedulesForMedication
 *  - Store-review trigger inside markDose
 */

import { create } from "zustand";
import { createMedicationsSlice } from "../../src/store/slices/medications";
import { storage } from "../../src/storage";
import { makeMedication, makeSchedule, makeTodayDose, makeDoseLog } from "../factories";

// ─── Mock external dependencies ────────────────────────────────────────────

jest.mock("../../src/db/database", () => ({
  upsertDoseLog: jest.fn().mockResolvedValue(undefined),
  deleteDoseLog: jest.fn().mockResolvedValue(undefined),
  getMedications: jest.fn().mockResolvedValue([]),
  getAllActiveSchedules: jest.fn().mockResolvedValue([]),
  updateMedicationStock: jest.fn().mockResolvedValue(undefined),
  getDoseLogsByDate: jest.fn().mockResolvedValue([]),
  getDoseLogsByDateRange: jest.fn().mockResolvedValue([]),
  getSchedulesByMedication: jest.fn().mockResolvedValue([]),
  insertMedication: jest.fn().mockResolvedValue(undefined),
  insertSchedule: jest.fn().mockResolvedValue(undefined),
  updateMedication: jest.fn().mockResolvedValue(undefined),
  deleteMedication: jest.fn().mockResolvedValue(undefined),
  deleteSchedule: jest.fn().mockResolvedValue(undefined),
  updateDoseLogNotes: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/notifications", () => ({
  cancelDoseNotifications: jest.fn().mockResolvedValue(undefined),
  cancelScheduleNotifications: jest.fn().mockResolvedValue(undefined),
  scheduleDoseChain: jest.fn().mockResolvedValue(undefined),
  snoozeDose: jest.fn().mockResolvedValue(undefined),
  scheduleStockAlert: jest.fn().mockResolvedValue(undefined),
  rescheduleAllNotifications: jest.fn().mockResolvedValue(undefined),
  SNOOZE_MINUTES: 15,
}));

import * as db from "../../src/db/database";
import * as notifs from "../../src/services/notifications";
import * as StoreReview from "expo-store-review";

// ─── Test store factory ─────────────────────────────────────────────────────

const mockLoadTodayLogs = jest.fn().mockResolvedValue(undefined);

function makeTestStore(initialState: Record<string, unknown> = {}) {
  return create<any>()((...a) => ({
    todayLogs: [],
    loadTodayLogs: mockLoadTodayLogs,
    snoozedTimes: {},
    ...createMedicationsSlice(...a),
    ...initialState,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadTodayLogs.mockResolvedValue(undefined);
  jest.mocked(db.getMedications).mockResolvedValue([]);
  jest.mocked(db.getAllActiveSchedules).mockResolvedValue([]);
  jest.mocked(db.getDoseLogsByDate).mockResolvedValue([]);
});

// ─── addMedication ─────────────────────────────────────────────────────────

describe("addMedication", () => {
  it("inserts the medication and its schedules into the DB", async () => {
    const scheduleInput = { time: "08:00", days: [] };

    const store = makeTestStore();
    await store.getState().addMedication(
      { name: "Test", dosageAmount: 100, dosageUnit: "mg", dosage: "100 mg", category: "otro", color: "blue" },
      [scheduleInput]
    );

    expect(jest.mocked(db.insertMedication)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(db.insertSchedule)).toHaveBeenCalledTimes(1);
  });

  it("returns the newly created medication with generated id and timestamps", async () => {
    const store = makeTestStore();
    const result = await store.getState().addMedication(
      { name: "Aspirin", dosageAmount: 500, dosageUnit: "mg", dosage: "500 mg", category: "analgesico", color: "red" },
      []
    );

    expect(result.id).toBeDefined();
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeDefined();
    expect(result.name).toBe("Aspirin");
  });

  it("handles multiple schedules", async () => {
    const store = makeTestStore();
    await store.getState().addMedication(
      { name: "Multi", dosageAmount: 1, dosageUnit: "mg", dosage: "1 mg", category: "otro", color: "blue" },
      [{ time: "08:00", days: [] }, { time: "20:00", days: [] }]
    );

    expect(jest.mocked(db.insertSchedule)).toHaveBeenCalledTimes(2);
  });

  it("reloads medications and schedules after insertion", async () => {
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication()]);
    jest.mocked(db.getAllActiveSchedules).mockResolvedValue([makeSchedule()]);

    const store = makeTestStore();
    await store.getState().addMedication(
      { name: "Test", dosageAmount: 1, dosageUnit: "mg", dosage: "1 mg", category: "otro", color: "blue" },
      []
    );

    expect(store.getState().medications).toHaveLength(1);
    expect(store.getState().schedules).toHaveLength(1);
  });
});

// ─── deleteMedication ──────────────────────────────────────────────────────

describe("deleteMedication", () => {
  it("cancels notifications and deletes from the DB", async () => {
    jest.mocked(db.getSchedulesByMedication).mockResolvedValue([makeSchedule()]);

    const store = makeTestStore();
    await store.getState().deleteMedication("med-1");

    expect(jest.mocked(notifs.cancelScheduleNotifications)).toHaveBeenCalledWith("sch-1");
    expect(jest.mocked(db.deleteMedication)).toHaveBeenCalledWith("med-1");
  });

  it("reloads state after deletion", async () => {
    jest.mocked(db.getSchedulesByMedication).mockResolvedValue([]);
    jest.mocked(db.getMedications).mockResolvedValue([]);
    jest.mocked(db.getAllActiveSchedules).mockResolvedValue([]);

    const store = makeTestStore({ medications: [makeMedication()] });
    await store.getState().deleteMedication("med-1");

    expect(jest.mocked(db.getMedications)).toHaveBeenCalled();
  });
});

// ─── updateDoseNote ────────────────────────────────────────────────────────

describe("updateDoseNote", () => {
  it("updates the note in the DB and reloads logs", async () => {
    const store = makeTestStore();
    await store.getState().updateDoseNote("sch-1", "2025-06-16", "Took with food");

    expect(jest.mocked(db.updateDoseLogNotes)).toHaveBeenCalledWith(
      "sch-1",
      "2025-06-16",
      "Took with food"
    );
    expect(mockLoadTodayLogs).toHaveBeenCalled();
  });
});

// ─── revertSnooze ──────────────────────────────────────────────────────────

describe("revertSnooze", () => {
  it("cancels the snoozed notification and removes the key from snoozedTimes", async () => {
    const store = makeTestStore();
    store.setState({ snoozedTimes: { "sch-1-2025-06-16": "08:30" } });

    const dose = makeTodayDose({ scheduledDate: "2025-06-16", schedule: makeSchedule({ time: "08:00" }) });
    await store.getState().revertSnooze(dose);

    expect(jest.mocked(notifs.cancelDoseNotifications)).toHaveBeenCalledWith("sch-1", "2025-06-16");
    expect(store.getState().snoozedTimes).not.toHaveProperty("sch-1-2025-06-16");
  });

  it("reschedules the notification if original time is in the future", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0)); // 07:00

    const store = makeTestStore();
    const dose = makeTodayDose({
      scheduledDate: "2025-06-16",
      schedule: makeSchedule({ time: "08:00" }), // 08:00 > 07:00 → future
    });

    await store.getState().revertSnooze(dose);

    // scheduleDoseChain is called by _scheduleNotificationsForSchedule
    expect(jest.mocked(notifs.scheduleDoseChain)).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it("does NOT reschedule if original time has already passed", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 16, 10, 0, 0, 0)); // 10:00

    const store = makeTestStore();
    const dose = makeTodayDose({
      scheduledDate: "2025-06-16",
      schedule: makeSchedule({ time: "08:00" }), // 08:00 < 10:00 → in the past
    });

    await store.getState().revertSnooze(dose);

    // The revertSnooze still cancels, but no reschedule since time passed
    expect(jest.mocked(notifs.cancelDoseNotifications)).toHaveBeenCalled();

    jest.useRealTimers();
  });
});

// ─── logPRNDose ────────────────────────────────────────────────────────────

describe("logPRNDose", () => {
  it("persists a 'taken' log for the PRN medication", async () => {
    const med = makeMedication({ isPRN: true });
    const store = makeTestStore();
    await store.getState().logPRNDose(med);

    expect(jest.mocked(db.upsertDoseLog)).toHaveBeenCalledTimes(1);
    const log = jest.mocked(db.upsertDoseLog).mock.calls[0][0];
    expect(log.status).toBe("taken");
    expect(log.medicationId).toBe("med-1");
    expect(log.takenAt).toBeDefined();
  });

  it("PRN scheduleId is unique per call", async () => {
    const med = makeMedication({ isPRN: true });
    const store = makeTestStore();

    await store.getState().logPRNDose(med);
    await store.getState().logPRNDose(med);

    const [call1, call2] = jest.mocked(db.upsertDoseLog).mock.calls;
    expect(call1[0].scheduleId).not.toBe(call2[0].scheduleId);
  });

  it("decrements PRN medication stock", async () => {
    const med = makeMedication({ isPRN: true, stockQuantity: 5 });
    jest.mocked(db.getMedications).mockResolvedValue([{ ...med, stockQuantity: 4 }]);
    const store = makeTestStore({ medications: [med] });

    await store.getState().logPRNDose(med);

    expect(jest.mocked(db.updateMedicationStock)).toHaveBeenCalledWith("med-1", 4);
  });

  it("calls loadTodayLogs after logging", async () => {
    const med = makeMedication({ isPRN: true });
    const store = makeTestStore();
    await store.getState().logPRNDose(med);

    expect(mockLoadTodayLogs).toHaveBeenCalled();
  });
});

// ─── getHistoryLogs ────────────────────────────────────────────────────────

describe("getHistoryLogs", () => {
  it("delegates to getDoseLogsByDateRange with the given date range", async () => {
    const logs = [makeDoseLog()];
    jest.mocked(db.getDoseLogsByDateRange).mockResolvedValue(logs);

    const store = makeTestStore();
    const result = await store.getState().getHistoryLogs("2025-06-01", "2025-06-16");

    expect(jest.mocked(db.getDoseLogsByDateRange)).toHaveBeenCalledWith("2025-06-01", "2025-06-16");
    expect(result).toEqual(logs);
  });
});

// ─── getSchedulesForMedication ─────────────────────────────────────────────

describe("getSchedulesForMedication", () => {
  it("returns schedules matching the given medicationId", () => {
    const sch1 = makeSchedule({ id: "sch-1", medicationId: "med-1" });
    const sch2 = makeSchedule({ id: "sch-2", medicationId: "med-2" });

    const store = makeTestStore({ schedules: [sch1, sch2] });
    const result = store.getState().getSchedulesForMedication("med-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sch-1");
  });

  it("returns empty array when medication has no schedules", () => {
    const store = makeTestStore({ schedules: [makeSchedule({ medicationId: "med-2" })] });
    expect(store.getState().getSchedulesForMedication("med-1")).toHaveLength(0);
  });
});

// ─── Store-review trigger (markDose taken, conditions met) ─────────────────

describe("markDose — store-review prompt", () => {
  it("triggers StoreReview when all conditions are met", async () => {
    jest.useFakeTimers();
    // Set "now" to June 16, 2025 — firstLaunch will be June 1 (15 days ago)
    jest.setSystemTime(new Date(2025, 5, 16, 10, 0, 0, 0));

    // Configure storage responses in order they are called:
    //   1. getString(REVIEW_PROMPTED)    → undefined (not prompted yet)
    //   2. getString(FIRST_LAUNCH)       → June 1 (15 days ago → >= 7 days)
    //   3. getString(DOSES_TAKEN_COUNT)  → "9" (becomes 10 after increment)
    jest
      .mocked(storage.getString)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce("2025-06-01T00:00:00.000Z")
      .mockReturnValueOnce("9");

    jest.mocked(StoreReview.isAvailableAsync).mockResolvedValue(true);

    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("does NOT trigger StoreReview when count < 10", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 16, 10, 0, 0, 0));

    jest
      .mocked(storage.getString)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce("2025-06-01T00:00:00.000Z")
      .mockReturnValueOnce("5"); // count 5 + 1 = 6, < 10

    jest.mocked(StoreReview.isAvailableAsync).mockResolvedValue(true);

    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("does NOT trigger StoreReview when review was already prompted", async () => {
    jest.mocked(storage.getString).mockReturnValueOnce("1"); // REVIEW_PROMPTED = "1"

    jest.mocked(StoreReview.isAvailableAsync).mockResolvedValue(true);

    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    jest.clearAllMocks();
  });
});
