import { Platform } from "react-native";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { initDatabase } from "../db/database";
import { rescheduleAllNotifications } from "./notifications";

// ─── Task name ─────────────────────────────────────────────────────────────

// ─── Platform documentation ────────────────────────────────────────────────
//
// Android
//   • BackgroundFetch runs at roughly the requested minimumInterval (6 h).
//   • stopOnTerminate: false keeps the task alive after the app is force-quit.
//   • startOnBoot: true re-registers automatically after a device reboot, so
//     AlarmManager alarms are restored when the phone powers back on.
//
// iOS
//   • stopOnTerminate and startOnBoot are silently ignored by iOS.
//   • The system decides when to execute the background fetch based on the
//     user’s historical usage patterns; minimumInterval is only a hint.
//     Execution may be delayed by hours or skipped entirely in low-power mode.
//   • Because iOS pre-schedules all dose notifications at app-open time
//     (see notifications.ts → DAYS_AHEAD = 3), the 3-day window is the real
//     safety buffer.  The AppState 'active' listener in _layout.tsx
//     (rescheduleAllNotifications on foreground) is the most reliable
//     reschedule hook on iOS.
//
export const BG_TASK_NAME = "PILL_RESCHEDULE_NOTIFICATIONS";

// ─── Task definition ───────────────────────────────────────────────────────
// IMPORTANT: defineTask must be called at module scope (before any renders).
// Importing this file from _layout.tsx is sufficient.

if (Platform.OS !== "web") TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    await initDatabase();
    await rescheduleAllNotifications();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.warn("[BackgroundTask] reschedule failed:", e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Registration helpers ──────────────────────────────────────────────────

/** Register the background fetch task if it isn't already registered. */
export async function registerBackgroundFetch(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return; // Not available on this device / permission denied.
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
        minimumInterval: 60 * 60 * 6, // 6 hours
        stopOnTerminate: false,       // keep alive after app is killed (Android)
        startOnBoot: true,            // reschedule after device restart
      });
    }
  } catch (e) {
    // Background fetch setup is non-critical; log but don't crash.
    console.warn("[BackgroundTask] registration failed:", e);
  }
}

/** Unregister (call when resetting all data so stale tasks don't run). */
export async function unregisterBackgroundFetch(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BG_TASK_NAME);
    }
  } catch {
    // Non-critical.
  }
}
