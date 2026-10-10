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
import { makeMedication, makeSchedule, makeTodayDose, makeDoseLog } from "../factories";

// ─── Mock external dependencies ────────────────────────────────────────────

jest.mock("../../src/db/database", () => ({
  saveDoseLogWithStock: jest.fn().mockResolvedValue(undefined),
  removeDoseLogWithStock: jest.fn().mockResolvedValue(undefined),
  saveMedicationWithSchedules: jest.fn().mockResolvedValue(undefined),
  deleteDoseLog: jest.fn().mockResolvedValue(undefined),
  getDoseLogByScheduleAndDate: jest.fn().mockResolvedValue(null),
  getMedications: jest.fn().mockResolvedValue([]),
  getActiveMedications: jest.fn().mockResolvedValue([]),
  getActiveAppointments: jest.fn().mockResolvedValue([]),
  getActiveHealthMeasurements: jest.fn().mockResolvedValue([]),
  getActiveDailyCheckins: jest.fn().mockResolvedValue([]),
  getProfiles: jest.fn().mockResolvedValue([{ id: "default", name: "", color: "blue", createdAt: "2026-01-01" }]),
  insertProfile: jest.fn().mockResolvedValue(undefined),
  updateProfile: jest.fn().mockResolvedValue(undefined),
  deleteProfileData: jest.fn().mockResolvedValue(undefined),
  getAllActiveSchedules: jest.fn().mockResolvedValue([]),
  updateMedicationStock: jest.fn().mockResolvedValue(undefined),
  getDoseLogsByDate: jest.fn().mockResolvedValue([]),
  getDoseLogsByDateRange: jest.fn().mockResolvedValue([]),
  getSchedulesByMedication: jest.fn().mockResolvedValue([]),
  insertMedication: jest.fn().mockResolvedValue(undefined),
  insertSchedule: jest.fn().mockResolvedValue(undefined),
  updateSchedule: jest.fn().mockResolvedValue(undefined),
  updateMedication: jest.fn().mockResolvedValue(undefined),
  deleteMedication: jest.fn().mockResolvedValue(undefined),
  deleteSchedule: jest.fn().mockResolvedValue(undefined),
  updateDoseLogNotes: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/notifications", () => ({
  cancelDoseNotifications: jest.fn().mockResolvedValue(undefined),
  cancelScheduleNotifications: jest.fn().mockResolvedValue(undefined),
  cancelAppointmentNotification: jest.fn().mockResolvedValue(undefined),
  scheduleDoseChain: jest.fn().mockResolvedValue(undefined),
  snoozeDose: jest.fn().mockResolvedValue(undefined),
  scheduleStockAlert: jest.fn().mockResolvedValue(undefined),
  scheduleRenewalReminders: jest.fn().mockResolvedValue(undefined),
  cancelRenewalReminders: jest.fn().mockResolvedValue(undefined),
  rescheduleAllNotifications: jest.fn().mockResolvedValue(undefined),
  SNOOZE_MINUTES: 15,
  DEFAULT_SNOOZE_MINUTES: 15,
  SNOOZE_OPTIONS: [5, 10, 15, 20, 25, 30, 45, 60],
  DAYS_AHEAD: 7,
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
  jest.mocked(db.saveDoseLogWithStock).mockResolvedValue(undefined);
  jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(null);
  mockLoadTodayLogs.mockResolvedValue(undefined);
  jest.mocked(db.getMedications).mockResolvedValue([]);
  jest.mocked(db.getDoseLogsByDate).mockResolvedValue([]);
  jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(null);
});

// ─── markDose — taken ─────────────────────────────────────────────────────

describe("markDose — taken", () => {
  it("persists a dose log with status 'taken'", async () => {
    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledTimes(1);
    const log = jest.mocked(db.saveDoseLogWithStock).mock.calls[0][0];
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

    const log = jest.mocked(db.saveDoseLogWithStock).mock.calls[0][0];
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

  it('retains the original-day link when an overnight dose is completed', async () => {
    const store = makeTestStore();
    const postponed = new Date(2025, 5, 17, 0, 10).toISOString();
    store.setState({ snoozedTimes: { 'sch-1-2025-06-16': postponed } });
    await store.getState().markDose(makeTodayDose({ snoozedUntil: postponed }), 'taken');
    expect(store.getState().snoozedTimes['sch-1-2025-06-16']).toBe(postponed);
  });

  it("calls loadTodayLogs after persisting", async () => {
    const store = makeTestStore();
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(mockLoadTodayLogs).toHaveBeenCalledTimes(1);
  });

  it("does NOT decrement stock when stockQuantity is undefined", async () => {
    const store = makeTestStore([makeMedication({ stockQuantity: undefined })]);
    await store.getState().markDose(makeTodayDose(), "taken");

    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledWith(expect.objectContaining({ stockDelta: 0 }), undefined);
  });

  it("decrements stock by 1 when stockQuantity is set", async () => {
    const med = makeMedication({ stockQuantity: 10 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledWith(expect.objectContaining({ stockDelta: 1 }), 9);
  });

  it("does NOT decrement stock when stockQuantity is 0", async () => {
    const med = makeMedication({ stockQuantity: 0 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledWith(expect.objectContaining({ stockDelta: 0 }), 0);
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

    const log = jest.mocked(db.saveDoseLogWithStock).mock.calls[0][0];
    expect(log.status).toBe("skipped");
    expect(log.skipReason).toBe("forgot");
    expect(log.takenAt).toBeUndefined();
  });

  it("preserves all skipReason values", async () => {
    const skipReasons = ["forgot", "side_effect", "no_stock", "other"] as const;
    for (const reason of skipReasons) {
      const store = makeTestStore();
      await store.getState().markDose(makeTodayDose(), "skipped", undefined, reason);
      const log = jest.mocked(db.saveDoseLogWithStock).mock.calls[0][0];
      expect(log.skipReason).toBe(reason);
      jest.clearAllMocks();
    }
  });

  it("does NOT decrement stock when skipped", async () => {
    const med = makeMedication({ stockQuantity: 5 });
    const store = makeTestStore([med]);
    await store.getState().markDose(makeTodayDose({ medication: med }), "skipped");

    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', stockDelta: 0 }), 5);
  });
});

// ─── Stock reconciliation (audit H16) ───────────────────────────────────────

describe("markDose — stock reconciliation (H16)", () => {
  it('never invents stock when undoing a dose registered at zero stock', async () => {
    const med = makeMedication({ stockQuantity: 0 });
    jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(makeDoseLog({ status: 'taken', stockDelta: 0 }));
    const store = makeTestStore([med]);
    await store.getState().revertDose(makeTodayDose({ medication: med }));
    expect(db.removeDoseLogWithStock).toHaveBeenCalledWith('sch-1', '2025-06-16', 'med-1', 0);
  });

  it('does not publish success or cancel an alarm when the atomic save fails', async () => {
    jest.mocked(db.saveDoseLogWithStock).mockRejectedValueOnce(new Error('disk full'));
    const med = makeMedication({ stockQuantity: 2 });
    const store = makeTestStore([med]);
    await expect(store.getState().markDose(makeTodayDose({ medication: med }), 'taken')).rejects.toThrow('disk full');
    expect(notifs.cancelDoseNotifications).not.toHaveBeenCalled();
    expect(mockLoadTodayLogs).not.toHaveBeenCalled();
    expect(store.getState().medications[0].stockQuantity).toBe(2);
  });

  it('serializes simultaneous registrations and writes only one stock decrement', async () => {
    let saved: ReturnType<typeof makeDoseLog> | null = null;
    jest.mocked(db.getDoseLogByScheduleAndDate).mockImplementation(async () => saved);
    jest.mocked(db.saveDoseLogWithStock).mockImplementationOnce(async (log) => { saved = log; });
    const med = makeMedication({ stockQuantity: 2 });
    const store = makeTestStore([med]);
    const dose = makeTodayDose({ medication: med });
    await Promise.all([store.getState().markDose(dose, 'taken'), store.getState().markDose(dose, 'taken')]);
    expect(db.saveDoseLogWithStock).toHaveBeenCalledTimes(1);
  });
  it("restores stock (+1) when a previously-taken dose is changed to skipped", async () => {
    const med = makeMedication({ stockQuantity: 9 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(makeDoseLog({ status: "taken" }));
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "skipped");

    // taken → skipped gives the pill back: 9 + 1 = 10
    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', stockDelta: 0 }), 10);
  });

  it("does NOT decrement again when re-marking an already-taken dose as taken", async () => {
    const med = makeMedication({ stockQuantity: 9 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(makeDoseLog({ status: "taken" }));
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "taken");

    // Already taken → no stock change (prevents double-decrement)
    expect(jest.mocked(db.saveDoseLogWithStock)).not.toHaveBeenCalled();
    // ...but any reminder still armed for the dose is silenced.
    expect(notifs.cancelDoseNotifications).toHaveBeenCalledWith("sch-1", "2025-06-16");
  });

  it("does NOT restore stock on skip when there was no prior taken log", async () => {
    const med = makeMedication({ stockQuantity: 9 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    // prior is null (default) → nothing to restore
    const store = makeTestStore([med]);

    await store.getState().markDose(makeTodayDose({ medication: med }), "skipped");

    expect(jest.mocked(db.saveDoseLogWithStock)).toHaveBeenCalledWith(expect.objectContaining({ stockDelta: 0 }), 9);
  });
});

// ─── revertDose ────────────────────────────────────────────────────────────

describe("revertDose", () => {
  beforeEach(() => {
    jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(makeDoseLog({ status: 'taken' }));
  });
  it('does not rearm any alarm while undoing a historical dose', async () => {
    const store = makeTestStore();
    await store.getState().revertDose(makeTodayDose({ scheduledDate: '2020-01-01' }));
    expect(notifs.scheduleDoseChain).not.toHaveBeenCalled();
  });

  it('does not rearm a paused treatment when its future dose is undone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 16, 7));
    try {
      const med = makeMedication({ isActive: false });
      const store = makeTestStore([med]);
      await store.getState().revertDose(makeTodayDose({ medication: med }));
      expect(notifs.scheduleDoseChain).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  it("deletes the dose log from the database", async () => {
    const store = makeTestStore();
    await store.getState().revertDose(makeTodayDose({ status: "taken" }));

    expect(jest.mocked(db.removeDoseLogWithStock)).toHaveBeenCalledWith("sch-1", "2025-06-16", "med-1", undefined);
  });

  it("restores stock (+1) when the reverted dose had been taken (H16)", async () => {
    const med = makeMedication({ stockQuantity: 9 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(makeDoseLog({ status: "taken" }));
    const store = makeTestStore([med]);

    await store.getState().revertDose(makeTodayDose({ medication: med, status: "taken" }));

    expect(jest.mocked(db.removeDoseLogWithStock)).toHaveBeenCalledWith("sch-1", "2025-06-16", "med-1", 10);
  });

  it("does NOT restore stock when the reverted dose was not taken (H16)", async () => {
    const med = makeMedication({ stockQuantity: 9 });
    jest.mocked(db.getMedications).mockResolvedValue([med]);
    jest.mocked(db.getDoseLogByScheduleAndDate).mockResolvedValue(makeDoseLog({ status: "skipped" }));
    const store = makeTestStore([med]);

    await store.getState().revertDose(makeTodayDose({ medication: med, status: "skipped" }));

    expect(jest.mocked(db.removeDoseLogWithStock)).toHaveBeenCalledWith("sch-1", "2025-06-16", "med-1", 9);
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
  it('persists the date as well as time when a postponement crosses midnight', async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 23, 55));
    const store = makeTestStore();
    await store.getState().snoozeDose(makeTodayDose({ schedule: makeSchedule({ time: '23:50' }) }), 15);
    const saved = store.getState().snoozedTimes['sch-1-2025-06-16'];
    expect(new Date(saved)).toEqual(new Date(2025, 5, 17, 0, 10));
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

  it("snoozes with custom minutes (5 min)", async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({
      scheduledDate: "2025-06-16",
      scheduledTime: "08:00",
      schedule: makeSchedule({ time: "08:00" }),
    });

    await store.getState().snoozeDose(dose, 5);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("08:05");
  });

  it("snoozes with custom minutes (30 min)", async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({
      scheduledDate: "2025-06-16",
      scheduledTime: "08:00",
      schedule: makeSchedule({ time: "08:00" }),
    });

    await store.getState().snoozeDose(dose, 30);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("08:30");
  });

  it("snoozes with custom minutes (60 min) when dose is past", async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 9, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({
      schedule: makeSchedule({ time: "08:00" }),
    });

    await store.getState().snoozeDose(dose, 60);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("10:00");
  });

  it("stacks snoozes with custom minutes", async () => {
    jest.setSystemTime(new Date(2025, 5, 16, 7, 0, 0, 0));
    const store = makeTestStore();
    const dose = makeTodayDose({ schedule: makeSchedule({ time: "08:00" }) });

    // First snooze: 08:00 + 10 = 08:10
    await store.getState().snoozeDose(dose, 10);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("08:10");

    // Second snooze with 30 min: 08:10 + 30 = 08:40
    await store.getState().snoozeDose(dose, 30);
    expect(store.getState().snoozedTimes["sch-1-2025-06-16"]).toBe("08:40");
  });
});
