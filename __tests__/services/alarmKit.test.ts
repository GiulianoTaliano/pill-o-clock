/**
 * iOS 26+ AlarmKit layer in the notifications service.
 *
 * Each dose gets one AlarmKit alarm (rings through the silent switch) on top
 * of the notification chain, recorded in notification_map as "alarmkit:<id>"
 * so every existing cancel path silences it too. Without authorization (or
 * below iOS 26) nothing changes.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as AlarmKit from "expo-alarmkit";

jest.mock("expo-alarmkit", () => ({
  getAlarmKitAuthorization: jest.fn(),
  requestAlarmKitAuthorization: jest.fn(),
  scheduleAlarmKitAlarm: jest.fn().mockResolvedValue(undefined),
  cancelAlarmKitAlarm: jest.fn().mockResolvedValue(undefined),
  cancelAllAlarmKitAlarms: jest.fn().mockResolvedValue(undefined),
  getScheduledAlarmKitIds: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../src/services/timezone", () => ({
  detectTimezoneChange: () => ({ changed: false }),
}));

jest.mock("../../src/services/snoozedDoses", () => ({
  loadSnoozedDoses: () => ({}),
}));

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue(undefined),
  ActivityAction: {},
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("../../src/db/database", () => ({
  getDb: jest.fn().mockImplementation(() => Promise.resolve(mockDb)),
  getMedications: jest.fn().mockResolvedValue([{ id: "med-1", name: "Enalapril", isActive: true }]),
  getAllActiveSchedules: jest.fn().mockResolvedValue([]),
  getDoseLogsByDateRange: jest.fn().mockResolvedValue([]),
  getProfiles: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../src/i18n", () => ({
  t: (key: string) => key,
}));

jest.mock("../../src/services/regimen", () => ({
  withEffectiveDose: (med: unknown) => med,
}));

let mockUuidCounter = 0;
jest.mock("../../src/utils", () => ({
  parseTime: (t: string) => {
    const [hours, minutes] = t.split(":").map(Number);
    return { hours, minutes };
  },
  isScheduleActiveOnDate: jest.fn().mockReturnValue(true),
  getNextDates: jest.fn().mockReturnValue([]),
  toDateString: (d: Date) => d.toISOString().slice(0, 10),
  getLocalizedDosage: () => "1 tab",
  getProfileLabel: () => null,
  generateId: () => `00000000-0000-4000-8000-00000000000${++mockUuidCounter}`,
}));

import {
  refreshAlarmKitStatus,
  rescheduleAllNotifications,
  scheduleDoseChain,
  cancelDoseNotifications,
  cancelAllNotifications,
  isAlarmKitActive,
} from "../../src/services/notifications";

const med = { id: "med-1", name: "Enalapril", notes: null } as never;
const schedule = { id: "sch-1", medicationId: "med-1", time: "08:00" } as never;

/** A date string comfortably in the future, so the dose is schedulable. */
const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
})();

/** notif_ids written to notification_map by addNotifMapEntries. */
const insertedIds = () =>
  mockDb.runAsync.mock.calls
    .filter(([sql]) => String(sql).includes("INSERT OR REPLACE INTO notification_map"))
    .map(([, params]) => (params as string[])[0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockUuidCounter = 0;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  jest.mocked(Notifications.scheduleNotificationAsync).mockResolvedValue("notif-x");
});

describe("with AlarmKit authorized (iOS 26+)", () => {
  beforeEach(async () => {
    jest.mocked(AlarmKit.getAlarmKitAuthorization).mockResolvedValue("authorized");
    await refreshAlarmKitStatus();
  });

  it("schedules one alarm at the dose time and records it in notification_map", async () => {
    expect(isAlarmKitActive()).toBe(true);
    await scheduleDoseChain(med, schedule, futureDate, 0);

    expect(AlarmKit.scheduleAlarmKitAlarm).toHaveBeenCalledTimes(1);
    const alarm = jest.mocked(AlarmKit.scheduleAlarmKitAlarm).mock.calls[0][0];
    const [y, m, d] = futureDate.split("-").map(Number);
    expect(alarm.fireTimestamp).toBe(new Date(y, m - 1, d, 8, 0).getTime());
    expect(alarm.title).toBe("alarmKit.title");

    const ids = insertedIds();
    expect(ids).toContain(`alarmkit:${alarm.id}`);
    // The notification chain is still scheduled (actions + repeats).
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    expect(ids).toContain("notif-x");
  });

  it("falls back to notifications only when AlarmKit refuses the alarm", async () => {
    jest.mocked(AlarmKit.scheduleAlarmKitAlarm).mockRejectedValueOnce(new Error("denied"));
    await scheduleDoseChain(med, schedule, futureDate, 0);

    expect(insertedIds().some((id) => id.startsWith("alarmkit:"))).toBe(false);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    expect(isAlarmKitActive()).toBe(false);
  });
});

describe("without AlarmKit (iOS < 26 or not authorized)", () => {
  it.each(["unsupported", "denied", "notDetermined"] as const)(
    "does not schedule alarms when status is %s",
    async (status) => {
      jest.mocked(AlarmKit.getAlarmKitAuthorization).mockResolvedValue(status);
      await refreshAlarmKitStatus();
      await scheduleDoseChain(med, schedule, futureDate, 0);
      expect(AlarmKit.scheduleAlarmKitAlarm).not.toHaveBeenCalled();
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    }
  );
});

describe("cancellation", () => {
  it("cancelling a dose silences its alarm and cancels its notifications", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { notif_id: "alarmkit:abc-123", schedule_id: "sch-1", scheduled_date: futureDate },
      { notif_id: "notif-1", schedule_id: "sch-1", scheduled_date: futureDate },
    ]);
    await cancelDoseNotifications("sch-1", futureDate);

    expect(AlarmKit.cancelAlarmKitAlarm).toHaveBeenCalledWith("abc-123");
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-1");
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      "alarmkit:abc-123"
    );
  });

  it("cancelAllNotifications also clears every AlarmKit alarm on iOS", async () => {
    await cancelAllNotifications();
    expect(AlarmKit.cancelAllAlarmKitAlarms).toHaveBeenCalled();
  });
});

describe("reconciliation on reschedule", () => {
  const mappedRow = (notifId: string) => ({
    notif_id: notifId,
    schedule_id: "sch-1",
    scheduled_date: futureDate,
    scheduled_time: "08:00",
    medication_id: "med-1",
    dose_log_id: `sch-1-${futureDate}`,
  });
  const serveMap = (rows: object[]) =>
    mockDb.getAllAsync.mockImplementation(async (sql: string) =>
      String(sql).startsWith("SELECT * FROM notification_map") ? rows : []
    );

  beforeEach(async () => {
    jest.mocked(AlarmKit.getAlarmKitAuthorization).mockResolvedValue("authorized");
    await refreshAlarmKitStatus();
  });
  afterEach(() => mockDb.getAllAsync.mockReset().mockResolvedValue([]));

  it("recreates the alarm of a future dose that has notifications but no live alarm", async () => {
    serveMap([mappedRow("notif-1"), mappedRow("alarmkit:dead-id")]);
    jest.mocked(AlarmKit.getScheduledAlarmKitIds).mockResolvedValue([]);
    await rescheduleAllNotifications();

    expect(AlarmKit.scheduleAlarmKitAlarm).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "DELETE FROM notification_map WHERE notif_id = ?",
      ["alarmkit:dead-id"]
    );
    expect(insertedIds().some((id) => id.startsWith("alarmkit:"))).toBe(true);
  });

  it("leaves doses whose alarm is still scheduled alone", async () => {
    serveMap([mappedRow("notif-1"), mappedRow("alarmkit:live-id")]);
    jest.mocked(AlarmKit.getScheduledAlarmKitIds).mockResolvedValue(["LIVE-ID"]);
    await rescheduleAllNotifications();
    expect(AlarmKit.scheduleAlarmKitAlarm).not.toHaveBeenCalled();
  });
});
