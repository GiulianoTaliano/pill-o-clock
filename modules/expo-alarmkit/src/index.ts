import { Platform } from "react-native";
import Native from "./ExpoAlarmKitModule";

export type { AlarmKitAlarm, AlarmKitAuthorization } from "./ExpoAlarmKitModule";

// ─── Platform guard ────────────────────────────────────────────────────────
// AlarmKit exists only on iOS 26+. Everywhere else every function is a safe
// no-op, so callers can use this module unconditionally and fall back to
// plain notifications.

function supported(): boolean {
  if (Platform.OS !== "ios" || !Native) return false;
  try {
    return Native.isSupported();
  } catch {
    return false;
  }
}

/** True on iOS 26+ with the native module linked. */
export const isAlarmKitSupported = supported;

export async function getAlarmKitAuthorization() {
  if (!supported()) return "unsupported" as const;
  return Native!.getAuthorizationStatus();
}

/** Shows the system prompt the first time; afterwards returns the stored answer. */
export async function requestAlarmKitAuthorization() {
  if (!supported()) return "unsupported" as const;
  return Native!.requestAuthorization();
}

/** Schedules a one-shot system alarm. Throws if AlarmKit refuses it. */
export async function scheduleAlarmKitAlarm(
  alarm: import("./ExpoAlarmKitModule").AlarmKitAlarm
): Promise<void> {
  if (!supported()) return;
  return Native!.schedule(alarm);
}

/** Cancels (and silences, if ringing) an alarm. Safe for unknown ids. */
export async function cancelAlarmKitAlarm(id: string): Promise<void> {
  if (!supported()) return;
  return Native!.cancel(id);
}

/** Cancels every alarm this app scheduled. */
export async function cancelAllAlarmKitAlarms(): Promise<void> {
  if (!supported()) return;
  return Native!.cancelAll();
}

export async function getScheduledAlarmKitIds(): Promise<string[]> {
  if (!supported()) return [];
  return Native!.getScheduledIds();
}
