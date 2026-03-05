import { Platform } from "react-native";
import ExpoAlarmNativeModule from "./ExpoAlarmModule";

export type { AlarmParams } from "./ExpoAlarm.types";

// ─── Platform guard ────────────────────────────────────────────────────────
// All functions are no-ops on iOS/web; the module only ships native code for
// Android. requireOptionalNativeModule returns null on other platforms, so we
// check both the platform and module availability before calling any method.

export const isAvailable =
  Platform.OS === "android" && ExpoAlarmNativeModule !== null;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Schedule an exact alarm via AlarmManager.setAlarmClock().
 * On fire: starts AlarmAudioService which plays alarm.wav on STREAM_ALARM
 * and opens the app's alarm screen via fullScreenIntent / deep link.
 */
export async function scheduleAlarm(
  params: import("./ExpoAlarm.types").AlarmParams
): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.scheduleAlarm(params);
}

/**
 * Cancel a previously scheduled alarm by its schedule + date key.
 * Safe to call even if no alarm was scheduled.
 */
export async function cancelAlarm(
  scheduleId: string,
  scheduledDate: string
): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.cancelAlarm(scheduleId, scheduledDate);
}

/**
 * Stop the alarm audio service.
 * Call this when the user dismisses, takes, or snoozes from the alarm screen.
 */
export async function stopAlarm(): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.stopAlarm();
}

/**
 * Returns whether the app can show full-screen intents.
 * Always true below Android 14 (API 34). On API 34+, the user must grant
 * "Display over other apps (full screen intent)" in Settings.
 */
export async function checkFullScreenIntentPermission(): Promise<boolean> {
  if (!isAvailable) return false;
  return ExpoAlarmNativeModule!.checkFullScreenIntentPermission();
}
