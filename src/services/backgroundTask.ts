import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { addDays, format, subDays } from "date-fns";
import {
  initDatabase,
  getMedications,
  getAllSchedules,
  getDoseLogsByDateRange,
  insertMissedDoseLogSafe,
} from "../db/database";
import { rescheduleAllNotifications } from "./notifications";
import { DoseLog } from "../types";
import { generateId, isScheduleActiveOnDate, toDateString, toISOString } from "../utils";

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
    await closeMissedDoses();
    await rescheduleAllNotifications();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.warn("[BackgroundTask] reschedule failed:", e);
    Sentry.captureException(e, { tags: { task: BG_TASK_NAME } });
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
    Sentry.captureException(e, { tags: { task: BG_TASK_NAME } });
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

// ─── Close missed doses ───────────────────────────────────────────────────
//
// Looks back up to MISSED_LOOKBACK_DAYS days and upserts a "missed" log for
// every (schedule, date) pair that had no log yet.  This ensures the History
// screen shows consistent data even when the app wasn't open on a given day.

const MISSED_LOOKBACK_DAYS = 30;

export async function closeMissedDoses(): Promise<void> {
  const now = new Date();
  const todayStr = toDateString(now);
  const cutoff = subDays(now, MISSED_LOOKBACK_DAYS);
  const cutoffStr = toDateString(cutoff);
  const yesterdayStr = toDateString(subDays(now, 1));

  const [meds, schedules, existingLogs] = await Promise.all([
    getMedications(),
    getAllSchedules(),
    getDoseLogsByDateRange(cutoffStr, yesterdayStr),
  ]);

  // Build a fast lookup set of already-logged (scheduleId, date) pairs
  const logged = new Set(existingLogs.map((l) => `${l.scheduleId}|${l.scheduledDate}`));
  const medMap = new Map(meds.map((m) => [m.id, m]));
  const nowIso = toISOString(now);

  // Iterate each day in the range [cutoff, yesterday]
  let cursor = new Date(cutoff);
  while (toDateString(cursor) <= yesterdayStr) {
    const dateStr = toDateString(cursor);

    for (const schedule of schedules) {
      const med = medMap.get(schedule.medicationId);
      if (!med) continue;
      if (!isScheduleActiveOnDate(schedule, cursor, med)) continue;
      if (logged.has(`${schedule.id}|${dateStr}`)) continue;

      const missedLog: DoseLog = {
        id: generateId(),
        medicationId: med.id,
        scheduleId: schedule.id,
        scheduledDate: dateStr,
        scheduledTime: schedule.time,
        status: "missed",
        createdAt: nowIso,
      };
      await insertMissedDoseLogSafe(missedLog);
      // Add to set so subsequent insertions in the same run don't duplicate
      logged.add(`${schedule.id}|${dateStr}`);
    }

    cursor = addDays(cursor, 1);
  }
}
