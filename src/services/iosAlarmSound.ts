/**
 * iOS dose-reminder sound choice.
 *
 * Android lets the user pick any ringtone on the device, because the native
 * alarm module can enumerate them (see modules/expo-alarm). iOS apps have no
 * such API: a notification may only play a sound that ships inside the app
 * bundle, or the system default. So the iOS choice is deliberately small.
 *
 * Kept in its own module (like ./snoozeSettings) so the store slices and UI
 * that only need the setting don't pull in the whole notifications service.
 * Reads are synchronous (MMKV).
 */
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

/**
 * Available choices.
 *  - "bundled": alarm.wav, shipped with the app (registered by the
 *    expo-notifications config plugin in app.json).
 *  - "system": the standard iOS notification sound.
 */
export type IosAlarmSound = "bundled" | "system";

export const IOS_ALARM_SOUNDS: readonly IosAlarmSound[] = ["bundled", "system"] as const;

/** The bundled file name, as registered with expo-notifications. */
export const BUNDLED_SOUND_FILE = "alarm.wav";

const DEFAULT_SOUND: IosAlarmSound = "bundled";

/** Current choice; falls back to the bundled alarm when unset or invalid. */
export function getIosAlarmSound(): IosAlarmSound {
  const raw = storage.getString(STORAGE_KEYS.IOS_ALARM_SOUND);
  return raw === "system" || raw === "bundled" ? raw : DEFAULT_SOUND;
}

/** Persists the choice. */
export function setIosAlarmSound(sound: IosAlarmSound): void {
  if (!IOS_ALARM_SOUNDS.includes(sound)) {
    throw new Error(`Invalid iOS alarm sound: ${sound}`);
  }
  storage.set(STORAGE_KEYS.IOS_ALARM_SOUND, sound);
}

/**
 * The value to hand to expo-notifications' `content.sound`.
 *
 * "default" is what iOS understands as the standard notification sound;
 * anything else is looked up as a bundled file name.
 */
export function resolveNotificationSound(): string {
  return getIosAlarmSound() === "system" ? "default" : BUNDLED_SOUND_FILE;
}
