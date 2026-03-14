/**
 * __tests__/store/markDose.test.ts
 *
 * P0 — Zustand medications slice: markDose, revertDose, snoozeDose actions.
 *
 * Strategy:
 *  - Mock all external I/O (DB, notifications, storage, store-review).
 *  - Build a minimal Zustand store with just the medications slice + core stubs.
 *  - Assert side-effects (which mocks were called) and state changes.
 */

import { create } from "zustand";
import { createMedicationsSlice } from "../../src/store/slices/medications";
import { makeMedication, makeSchedule, makeTodayDose } from "../factories";

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

// ─── Typed references to mocked modules ────────────────────────────────────

import * as db from "../../src/db/database";
import * as notifs from "../../src/services/notifications";

// ─── Test store factory ─────────────────────────────────────────────────────

const mockLoadTodayLogs = jest.fn().mockResolvedValue(undefined);

function makeTestStore(initialMedications: ReturnType<typeof makeMedication>[] = []) {
  const store = create<any>()((...a) => ({
    // ── Core stubs ──────────────────────────────────────────────────────────
    todayLogs: [],
    loadTodayLogs: mockLoadTodayLogs,
    snoozedTimes: {},
    // ── Slice under test ────────────────────────────────────────────────────
    ...createMedicationsSlice(...a),
    // ── State seed ─────────────────────────────────────────────────────────
    medications: initialMedications,
  }));
  return store;
}

// ─── Shared reset ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadTodayLogs.mockResolvedValue(undefined);
  jest.mocked(db.getMedications).mockResolvedValue([]);
  jest.mocked(db.getDoseLogsByDate).mockResolvedValue([]);
});

// ─── markDose — taken ─────────────────────────────────────────────────────

describe("markDose — taken", () => {
  it("persists a dose log with status 'taken'", async () => {
    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(jest.mocked(db.upsertDoseLog)).toHaveBeenCalledTimes(1);
    const log = jest.mocked(db.upsertDoseLog).mock.calls[0][0];
    expect(log.status).toBe("taken");
    expect(log.medicationId).toBe("med-1");
    expect(log.scheduleId).toBe("sch-1");
    expect(log.scheduledDate).toBe("2025-06-16");
    expect(log.takenAt).toBeDefined();
    expect(log.skipReason).toBeUndefined();
  });

  it("sets snoozedUntil as the scheduledTime when dose was snoozed", async () => {
    const store = makeTestStore();
    const dose = makeTodayDose({ snoozedUntil: "08:30" });
    await store.getState().markDose(dose, "taken");

    const log = jest.mocked(db.upsertDoseLog).mock.calls[0][0];
    expect(log.scheduledTime).toBe("08:30");
  });

  it("cancels the pending dose notification", async () => {
    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(jest.mocked(notifs.cancelDoseNotifications)).toHaveBeenCalledWith(
      "sch-1",
      "2025-06-16"
    );
  });

  it("removes the dose key from snoozedTimes", async () => {
    const store = makeTestStore();
    store.setState({ snoozedTimes: { "sch-1-2025-06-16": "08:30", other: "09:00" } });

    await store.getState().markDose(makeTodayDose(), "taken");

    expect(store.getState().snoozedTimes).not.toHaveProperty("sch-1-2025-06-16");
    // Other keys are preserved
    expect(store.getState().snoozedTimes).toHaveProperty("other");
  });

  it("calls loadTodayLogs after persisting", async () => {
    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(mockLoadTodayLogs).toHaveBeenCalledTimes(1);
  });

  it("does NOT decrement stock when stockQuantity is undefined", async () => {
    const store = makeTestStore([makeMedication({ stockQuantity: undefined })]);
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(jest.mocked(db.updateMedicationStock)).not.toHaveBeenCalled();
  });

  it("decrements stock by 1 when stockQuantity is set", async () => {
    const med = makeMedication({ stockQuantity: 10 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    expect(jest.mocked(db.updateMedicationStock)).toHaveBeenCalledWith("med-1", 9);
  });

  it("does NOT decrement stock when stockQuantity is 0", async () => {
    const med = makeMedication({ stockQuantity: 0 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    expect(jest.mocked(db.updateMedicationStock)).not.toHaveBeenCalled();
  });

  it("fires stockAlert when stock drops below threshold", async () => {
    const med = makeMedication({ stockQuantity: 5, stockAlertThreshold: 5 });
    jest.mocked(db.getMedications).mockResolvedValue([{ ...med, stockQuantity: 4 }]);
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    // stock 5 - 1 = 4, threshold = 5 → 4 < 5 → alert fires
    expect(jest.mocked(notifs.scheduleStockAlert)).toHaveBeenCalledWith(
      expect.objectContaining({ stockQuantity: 4 })
    );
  });

  it("does NOT fire stockAlert when stock stays at or above threshold", async () => {
    const med = makeMedication({ stockQuantity: 10, stockAlertThreshold: 5 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    // stock 10 - 1 = 9, threshold = 5 → 9 >= 5 → no alert
    expect(jest.mocked(notifs.scheduleStockAlert)).not.toHaveBeenCalled();
  });
});

// ─── markDose — skipped ────────────────────────────────────────────────────

describe("markDose — skipped", () => {
  it("persists a log with status 'skipped' and the skipReason", async () => {
    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "skipped", undefined, "forgot");

    const log = jest.mocked(db.upsertDoseLog).mock.calls[0][0];
    expect(log.status).toBe("skipped");
    expect(log.skipReason).toBe("forgot");
    expect(log.takenAt).toBeUndefined();
  });

  it("preserves all skipReason values", async () => {
    const skipReasons = ["forgot", "side_effect", "no_stock", "other"] as const;
    for (const reason of skipReasons) {
      const store = makeTestStore();
      await store.getState().markDose(makeTodayDose(), "skipped", undefined, reason);
      const log = jest.mocked(db.upsertDoseLog).mock.calls[0][0];
      expect(log.skipReason).toBe(reason);
      jest.clearAllMocks();
    }
  });

  it("does NOT decrement stock when skipped", async () => {
    const med = makeMedication({ stockQuantity: 5 });
    const store = makeTestStore([med]);
    await store.getState().markDose(makeTodayDose({ medication: med }), "skipped");

    expect(jest.mocked(db.updateMedicationStock)).not.toHaveBeenCalled();
  });
});

// ─── revertDose ────────────────────────────────────────────────────────────

describe("revertDose", () => {
  it("deletes the dose log from the database", async () => {
    const store = makeTestStore();
    await store.getState().revertDose(makeTodayDose({ status: "taken" }));

    expect(jest.mocked(db.deleteDoseLog)).toHaveBeenCalledWith("sch-1", "2025-06-16");
  });

  it("calls loadTodayLogs after reverting", async () => {
    const store = makeTestStore();
    await store.getState().revertDose(makeTodayDose({ status: "taken" }));

    expect(mockLoadTodayLogs).toHaveBeenCalledTimes(1);
  });

  it("clears the snoozedTimes key for the reverted dose", async () => {
    const store = makeTestStore();
    store.setState({ snoozedTimes: { "sch-1-2025-06-16": "08:30", other: "09:00" } });

    await store.getState().revertDose(makeTodayDose({ status: "taken" }));

    expect(store.getState().snoozedTimes).not.toHaveProperty("sch-1-2025-06-16");
    expect(store.getState().snoozedTimes).toHaveProperty("other");
  });

  it("reschedules notifications for future dates after deletion", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0)); // 07:00 — schedule at 08:00 is in the future

    const store = makeTestStore();
    await store.getState().revertDose(makeTodayDose({ status: "taken" }));

    expect(jest.mocked(notifs.scheduleDoseChain)).toHaveBeenCalled();

    jest.useRealTimers();
  });
});

// ─── snoozeDose ────────────────────────────────────────────────────────────

describe("snoozeDose", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates snoozedTimes when dose is snoozed before its scheduled time", async () => {
    // System time: 07:00 AM — schedule at 08:00 → still in the future
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({
      scheduledDate: "2025-06-16",
      scheduledTime: "08:00",
      schedule: makeSchedule({ time: "08:00" }),
    });

    await store.getState().snoozeDose(dose);

    const snoozedTimes = store.getState().snoozedTimes;
    expect(snoozedTimes["sch-1-2025-06-16"]).toBeDefined();
    // Snoozed time should be 08:00 + 15 min = 08:15
    expect(snoozedTimes["sch-1-2025-06-16"]).toBe("08:15");
  });

  it("updates snoozedTimes when dose is snoozed after its scheduled time", async () => {
    // System time: 09:00 AM — schedule at 08:00 → already in the past
    jest.setSystemTime(new Date(2025, 5, 16, 9, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({
      schedule: makeSchedule({ time: "08:00" }),
    });

    await store.getState().snoozeDose(dose);

    const snoozedTimes = store.getState().snoozedTimes;
    expect(snoozedTimes["sch-1-2025-06-16"]).toBeDefined();
    // Snoozed time = now + 15 min = 09:15
    expect(snoozedTimes["sch-1-2025-06-16"]).toBe("09:15");
  });

  it("calls the notification snoozeDose function", async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 9, 0, 0, 0));
    const store = makeTestStore();
    await store.getState().snoozeDose(makeTodayDose());

    expect(jest.mocked(notifs.snoozeDose)).toHaveBeenCalledTimes(1);
  });

  it("stacks snoozes: second snooze is based on the first snoozed time", async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({ schedule: makeSchedule({ time: "08:00" }) });

    // First snooze: 08:00 + 15 = 08:15
    await store.getState().snoozeDose(dose);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("08:15");

    // Second snooze: 08:15 + 15 = 08:30
    await store.getState().snoozeDose(dose);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("08:30");
  });
});
