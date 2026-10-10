import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  checkExactAlarmPermission,
  checkFullScreenIntentPermission,
  isAvailable,
} from "expo-alarm";
import i18n from "../i18n";
import { NOTIFICATION_CHANNEL_ID } from "./notifications";
import { resolveNotificationSound } from "./iosAlarmSound";

export type PermissionState =
  | "granted"
  | "denied"
  | "notAsked"
  | "limited"
  | "error"
  | "unavailable";
export interface ReminderReadiness {
  notifications: PermissionState;
  exact: PermissionState;
  fullScreen: PermissionState;
}
const check = async (
  read: () => Promise<boolean>
): Promise<PermissionState> => {
  try {
    return (await read()) ? "granted" : "denied";
  } catch {
    return "error";
  }
};
/** Read-only: inspecting readiness must never trigger a system permission dialog. */
export async function getReminderReadiness(): Promise<ReminderReadiness> {
  if (Platform.OS === "web")
    return {
      notifications: "unavailable",
      exact: "unavailable",
      fullScreen: "unavailable",
    };
  const [notifications, exact, fullScreen] = await Promise.all([
    (async (): Promise<PermissionState> => {
      try {
        const p = await Notifications.getPermissionsAsync();
        if (
          p.ios &&
          p.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL
        )
          return "limited";
        if (p.granted || p.status === "granted") return "granted";
        return p.status === "undetermined" ? "notAsked" : "denied";
      } catch {
        return "error";
      }
    })(),
    Platform.OS === "android" && isAvailable
      ? check(checkExactAlarmPermission)
      : Promise.resolve("unavailable" as const),
    Platform.OS === "android" && isAvailable
      ? check(checkFullScreenIntentPermission)
      : Promise.resolve("unavailable" as const),
  ]);
  return { notifications, exact, fullScreen };
}
/** A device test has no medication/schedule identifiers and cannot create a dose log. */
export async function scheduleReminderTest(): Promise<string> {
  if ((await getReminderReadiness()).notifications !== "granted")
    throw new Error("notifications_unavailable");
  return Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t("uxSettings.testTitle"),
      body: i18n.t("uxSettings.testBody"),
      sound: Platform.OS === "ios" ? resolveNotificationSound() : "alarm.wav",
      data: { type: "reminder_test" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      ...(Platform.OS === "android"
        ? { channelId: NOTIFICATION_CHANNEL_ID }
        : {}),
    },
  });
}
