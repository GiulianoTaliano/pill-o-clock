import { Platform } from "react-native";
import ExpoAlarmNativeModule from "./ExpoAlarmModule";

export type { AlarmParams, AlarmSound } from "./ExpoAlarm.types";

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

/**
 * Opens the system settings screen where the user can grant
 * USE_FULL_SCREEN_INTENT (Android 14+ only).  No-op on older versions.
 */
export async function requestFullScreenIntentPermission(): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.requestFullScreenIntentPermission();
}

/**
 * Sets window flags so the activity shows on the lock screen and wakes the
 * display.
 * Call on mount of the alarm screen so it appears above the lock screen.
 */
export async function setAlarmWindowFlags(): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.setAlarmWindowFlags();
}

/**
 * Clears the lock-screen / wake-up window flags.
 * Call when the alarm screen unmounts so the flags don’t bleed into other screens.
 */
export async function clearAlarmWindowFlags(): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.clearAlarmWindowFlags();
}
// ─── Alarm sound selection ─────────────────────────────────────────────────

/**
 * Returns all available alarm sounds on the device.
 * The first entry (uri="") is always the bundled default.
 */
export async function getAvailableAlarmSounds(): Promise<
  import("./ExpoAlarm.types").AlarmSound[]
> {
  if (!isAvailable) return [];
  return ExpoAlarmNativeModule!.getAvailableAlarmSounds();
}

/**
 * Preview an alarm sound. Pass empty string to preview the bundled default.
 * Automatically stops any previous preview.
 */
export async function previewAlarmSound(uri: string): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.previewAlarmSound(uri);
}

/** Stop any currently playing sound preview. */
export async function stopSoundPreview(): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.stopSoundPreview();
}

/**
 * Persist the user's alarm sound choice.
 * Empty uri/title = revert to bundled default.
 */
export async function setAlarmSound(
  uri: string,
  title: string,
): Promise<void> {
  if (!isAvailable) return;
  return ExpoAlarmNativeModule!.setAlarmSound(uri, title);
}

/**
 * Read the currently saved alarm sound preference.
 * Returns `{ uri: "", title: "" }` when the bundled default is selected.
 */
export async function getAlarmSound(): Promise<
  import("./ExpoAlarm.types").AlarmSound
> {
  if (!isAvailable) return { uri: "", title: "" };
  return ExpoAlarmNativeModule!.getAlarmSound();
}