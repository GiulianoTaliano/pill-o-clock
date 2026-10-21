import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Alarm from "expo-alarm";
import { getReminderReadiness, scheduleReminderTest } from "../src/services/reminderReadiness";
jest.mock("../src/services/notifications", () => ({
  NOTIFICATION_CHANNEL_ID: "pill-reminders-v2",
  hasCriticalAlerts: jest.fn(() => false),
}));
jest.mock("expo-notifications", () => ({
  ...jest.requireActual("expo-notifications"),
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("test"),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted", granted: true } as never);
  jest.mocked(Alarm.checkExactAlarmPermission).mockResolvedValue(true);
  jest.mocked(Alarm.checkFullScreenIntentPermission).mockResolvedValue(true);
});
it("reads all permissions without requesting them", async () => {
  expect(await getReminderReadiness()).toEqual({ notifications: "granted", exact: "granted", fullScreen: "granted" });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
it("keeps read failures distinct from granted, and reflects revocation on recheck", async () => {
  jest.mocked(Alarm.checkFullScreenIntentPermission).mockRejectedValueOnce(new Error("native"));
  expect((await getReminderReadiness()).fullScreen).toBe("error");
  jest.mocked(Alarm.checkExactAlarmPermission).mockResolvedValue(false);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied", granted: false } as never);
  expect(await getReminderReadiness()).toMatchObject({ notifications: "denied", exact: "denied" });
});
it("distinguishes first-use permission from refusal", async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "undetermined", granted: false } as never);
  expect((await getReminderReadiness()).notifications).toBe("notAsked");
});
it("does not promise sound for provisional iOS notifications", async () => {
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted", granted: true, ios: { status: 3 } } as never);
  expect(await getReminderReadiness()).toEqual({ notifications: "limited", exact: "unavailable", fullScreen: "unavailable" });
});
it("test schedules no medication identifiers and cannot create a dose record", async () => {
  await scheduleReminderTest();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ data: { type: "reminder_test" } }),
    trigger: expect.objectContaining({ seconds: 5, channelId: "pill-reminders-v2" }),
  }));
});
it("on iOS the test uses the same interruption level as a real dose (not a plain notification)", async () => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  await scheduleReminderTest();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ interruptionLevel: "timeSensitive" }),
  }));
});
it("refuses tests without notification permission and reports web as unsupported", async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied", granted: false } as never);
  await expect(scheduleReminderTest()).rejects.toThrow();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
  expect(await getReminderReadiness()).toEqual({ notifications: "unavailable", exact: "unavailable", fullScreen: "unavailable" });
});
