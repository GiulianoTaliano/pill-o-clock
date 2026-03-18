/**
 * __tests__/services/cancelScheduleNotifications.test.ts
 *
 * Verifies that cancelScheduleNotifications cancels AlarmManager alarms
 * on Android in addition to expo-notifications. This is a regression test
 * for a bug where deleting a medication only cancelled expo-notifications
 * but left AlarmManager alarms intact, causing phantom alarms to fire.
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as ExpoAlarm from "expo-alarm";

// ─── Mocks ────────────────────────────────────────────────────────────────

// expo-alarm and expo-notifications are already mocked in jest.setup.ts.
// We only need additional mocks for modules that the notifications service
// imports internally.

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
  getAllAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
};

jest.mock("../../src/db/database", () => ({
  getDb: jest.fn().mockImplementation(() => Promise.resolve(mockDb)),
  getMedications: jest.fn().mockResolvedValue([]),
  getAllActiveSchedules: jest.fn().mockResolvedValue([]),
  getDoseLogsByDateRange: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../src/i18n", () => ({
  t: (key: string) => key,
}));

jest.mock("../../src/config", () => ({
  STORAGE_KEYS: {
    NOTIF_MAP: "notifMap",
    EXACT_ALARM_PROMPTED: "exactAlarmPrompted",
    FULLSCREEN_INTENT_PROMPTED: "fullscreenIntentPrompted",
  },
}));

jest.mock("../../src/utils", () => ({
  parseTime: (t: string) => {
    const [hours, minutes] = t.split(":").map(Number);
    return { hours, minutes };
  },
  isScheduleActiveOnDate: jest.fn().mockReturnValue(true),
  getNextDates: jest.fn().mockReturnValue([]),
  toDateString: (d: Date) => d.toISOString().slice(0, 10),
}));

// ─── Import after mocks ──────────────────────────────────────────────────

import { cancelScheduleNotifications } from "../../src/services/notifications";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeNotifMapRow(scheduleId: string, scheduledDate: string) {
  return {
    notif_id: `android-alarm:${scheduleId}:${scheduledDate}`,
    schedule_id: scheduleId,
    scheduled_date: scheduledDate,
    scheduled_time: "08:00",
    medication_id: "med-1",
    dose_log_id: `${scheduleId}-${scheduledDate}`,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("cancelScheduleNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cancels AlarmManager alarms on Android for each scheduled date", async () => {
    (Platform as any).OS = "android";

    mockDb.getAllAsync.mockResolvedValue([
      makeNotifMapRow("sch-1", "2026-03-16"),
      makeNotifMapRow("sch-1", "2026-03-17"),
      makeNotifMapRow("sch-1", "2026-03-18"),
    ]);

    await cancelScheduleNotifications("sch-1");

    expect(ExpoAlarm.cancelAlarm).toHaveBeenCalledTimes(3);
    expect(ExpoAlarm.cancelAlarm).toHaveBeenCalledWith("sch-1", "2026-03-16");
    expect(ExpoAlarm.cancelAlarm).toHaveBeenCalledWith("sch-1", "2026-03-17");
    expect(ExpoAlarm.cancelAlarm).toHaveBeenCalledWith("sch-1", "2026-03-18");

    expect(
      Notifications.cancelScheduledNotificationAsync
    ).toHaveBeenCalledTimes(3);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "DELETE FROM notification_map WHERE schedule_id = ?",
      ["sch-1"]
    );
  });

  it("does NOT call ExpoAlarm.cancelAlarm on iOS", async () => {
    (Platform as any).OS = "ios";

    mockDb.getAllAsync.mockResolvedValue([
      {
        ...makeNotifMapRow("sch-1", "2026-03-16"),
        notif_id: "ios-notif-1",
      },
    ]);

    await cancelScheduleNotifications("sch-1");

    expect(ExpoAlarm.cancelAlarm).not.toHaveBeenCalled();
    expect(
      Notifications.cancelScheduledNotificationAsync
    ).toHaveBeenCalledWith("ios-notif-1");
  });

  it("handles empty notification_map gracefully", async () => {
    (Platform as any).OS = "android";
    mockDb.getAllAsync.mockResolvedValue([]);

    await cancelScheduleNotifications("sch-1");

    expect(ExpoAlarm.cancelAlarm).not.toHaveBeenCalled();
    expect(
      Notifications.cancelScheduledNotificationAsync
    ).not.toHaveBeenCalled();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "DELETE FROM notification_map WHERE schedule_id = ?",
      ["sch-1"]
    );
  });

  it("deduplicates dates when multiple entries share the same schedule+date", async () => {
    (Platform as any).OS = "android";

    mockDb.getAllAsync.mockResolvedValue([
      makeNotifMapRow("sch-1", "2026-03-16"),
      {
        ...makeNotifMapRow("sch-1", "2026-03-16"),
        notif_id: "extra-notif:sch-1:2026-03-16",
      },
    ]);

    await cancelScheduleNotifications("sch-1");

    // Only one cancelAlarm call per unique date (Set deduplication)
    expect(ExpoAlarm.cancelAlarm).toHaveBeenCalledTimes(1);
    expect(ExpoAlarm.cancelAlarm).toHaveBeenCalledWith("sch-1", "2026-03-16");
  });
});
