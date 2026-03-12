import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import * as ExpoAlarm from "expo-alarm";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { addDays, addMinutes, format, startOfDay } from "date-fns";
import { Schedule, Medication, NotificationMap, Appointment } from "../types";
import { parseTime, isScheduleActiveOnDate, getNextDates, toDateString } from "../utils";
import i18n from "../i18n";
import { getMedications, getAllActiveSchedules, getDoseLogsByDateRange, getDb } from "../db/database";

// ─── Constants ─────────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNEL_ID = "pill-reminders-v2";
// v2: correct sound reference (alarm.wav) + bypassDnd. Android channel settings are
// immutable after creation, so a new ID forces a fresh channel on existing devices.
export const SNOOZE_MINUTES = 15;
export const REPEAT_INTERVAL_MINUTES = 5;
/**
 * How many repeat reminders to schedule after the initial notification.
 *
 * Android: 4 — each dose uses a single AlarmManager alarm, repeats are irrelevant.
 * iOS    : 2 — conserves the 64-notification slot budget.
 *               (initial + 2 repeats at +5 min and +10 min)
 */
export const MAX_REPEATS = Platform.OS === "ios" ? 2 : 4;

/**
 * How many days ahead to schedule notifications.
 *
 * Android: 7 — AlarmManager has no scheduling cap.
 * iOS    : 3 — keeps total pending notifications safely under the 64-slot OS limit.
 *              (3 days × ~6 schedules × 3 notifs/dose ≈ 54, leaving room for
 *               appointment + health-reminder notifications)
 */
const DAYS_AHEAD = Platform.OS === "ios" ? 3 : 7;

const NOTIF_MAP_KEY = "@pilloclock/notif_map";

// ─── Notification Actions ──────────────────────────────────────────────────

export const ACTION_TAKEN = "TAKEN";
export const ACTION_SNOOZE = "SNOOZE";
export const ACTION_SKIP = "SKIP";

// ─── Platform documentation ────────────────────────────────────────────────
//
// Android vs iOS notification delivery model:
//
//  Android
//   • Dose reminders use ExpoAlarm (AlarmManager.setAlarmClock) — a native
//     alarm that bypasses Doze, plays on STREAM_ALARM (sounds in silent mode),
//     opens the fullscreen alarm.tsx screen above the lock screen, and rings
//     until the user interacts.
//   • One alarm per dose is sufficient; the native module has no scheduling cap.
//   • Background reschedule (BackgroundFetch) runs reliably with startOnBoot.
//
//  iOS
//   • AlarmManager / fullScreenIntent do NOT exist on iOS. The alarm screen
//     is only reachable if the user taps the notification banner.
//   • Dose reminders use expo-notifications chains: initial + repeat every
//     REPEAT_INTERVAL_MINUTES minutes (up to MAX_REPEATS times).
//   • iOS enforces a hard cap of 64 pending local notifications across the
//     entire app. Exceeding it causes iOS to silently drop the oldest entries.
//     Budget breakdown: 3 days × (up to ~6 schedules) × 3 notifs/dose = ~54,
//     plus slots for appointment and health reminders.  Keep DAYS_AHEAD × MAX_REPEATS
//     products conservative on iOS.
//   • Sound plays once per notification (max 30 s). Bypass of DND requires
//     the Critical Alerts entitlement approved by Apple (see README).
//   • Background reschedule is best-effort; the AppState "active" listener
//     is the reliable hook on iOS.
//

// ─── Setup ─────────────────────────────────────────────────────────────────

export interface NotificationSetupResult {
  granted: boolean;
  /** True on Android 12/12L (API 31–32): user must manually grant Alarms & Reminders in Settings. */
  needsExactAlarmPermission: boolean;
}

export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
      { data: "package:com.pilloclock.app" }
    );
  } catch {
    // Fallback: open generic app settings
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      { data: "package:com.pilloclock.app" }
    );
  }
}

export async function setupNotifications(): Promise<NotificationSetupResult> {
  // Notifications are not supported on web
  if (Platform.OS === "web") {
    return { granted: false, needsExactAlarmPermission: false };
  }

  // One-time migration: move legacy AsyncStorage notification map to SQLite.
  await migrateNotifMapFromAsyncStorage();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Set action categories
  // opensAppToForeground: true ensures the response listener always fires,
  // even if the app was terminated when the user tapped the action.
  await Notifications.setNotificationCategoryAsync("DOSE_REMINDER", [
    {
      identifier: ACTION_TAKEN,
      buttonTitle: i18n.t("notifications.actionTaken"),
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: i18n.t("notifications.actionSnooze", { minutes: SNOOZE_MINUTES }),
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_SKIP,
      buttonTitle: i18n.t("notifications.actionSkip"),
      options: { isDestructive: true, opensAppToForeground: true },
    },
  ]);

  // Create Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: i18n.t("notifications.channelName"),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 300, 500, 300, 500],
      lightColor: "#4f9cff",
      sound: "alarm.wav",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      bypassDnd: true,
    });
    await setupStockAlertChannel();
    await setupAppointmentChannel();
    await setupHealthReminderChannel();
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  const needsExactAlarmPermission =
    Platform.OS === "android" &&
    typeof Platform.Version === "number" &&
    Platform.Version >= 31 &&
    Platform.Version < 33;

  if (existingStatus === "granted") return { granted: true, needsExactAlarmPermission };

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowCriticalAlerts: true,
    },
  });

  return { granted: status === "granted", needsExactAlarmPermission };
}

// ─── Notification Map helpers (SQLite-backed) ─────────────────────────────

type NotifMapRow = {
  notif_id: string;
  schedule_id: string;
  scheduled_date: string;
  scheduled_time: string;
  medication_id: string;
  dose_log_id: string;
};

/**
 * One-time migration: reads the legacy AsyncStorage notification map and
 * inserts all entries into the SQLite `notification_map` table, then clears
 * the old AsyncStorage key. Safe to call multiple times — a missing or empty
 * key is handled silently.
 */
async function migrateNotifMapFromAsyncStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_MAP_KEY);
    if (!raw) return;
    const legacy: NotificationMap = JSON.parse(raw);
    const entries = Object.entries(legacy);
    if (entries.length > 0) {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        for (const [notifId, data] of entries) {
          await db.runAsync(
            `INSERT OR IGNORE INTO notification_map
               (notif_id, schedule_id, scheduled_date, scheduled_time, medication_id, dose_log_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [notifId, data.scheduleId, data.scheduledDate, data.scheduledTime, data.medicationId, data.doseLogId]
          );
        }
      });
    }
    await AsyncStorage.removeItem(NOTIF_MAP_KEY);
  } catch {
    // Non-critical — old entries will be repopulated on next reschedule.
  }
}

async function loadNotifMap(): Promise<NotificationMap> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<NotifMapRow>("SELECT * FROM notification_map");
    const map: NotificationMap = {};
    for (const row of rows) {
      map[row.notif_id] = {
        doseLogId: row.dose_log_id,
        medicationId: row.medication_id,
        scheduleId: row.schedule_id,
        scheduledDate: row.scheduled_date,
        scheduledTime: row.scheduled_time,
      };
    }
    return map;
  } catch {
    return {};
  }
}

export { loadNotifMap };

export async function addNotifMapEntries(
  entries: { notifId: string; data: NotificationMap[string] }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const { notifId, data } of entries) {
      await db.runAsync(
        `INSERT OR REPLACE INTO notification_map
           (notif_id, schedule_id, scheduled_date, scheduled_time, medication_id, dose_log_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [notifId, data.scheduleId, data.scheduledDate, data.scheduledTime, data.medicationId, data.doseLogId]
      );
    }
  });
}

export async function removeNotifMapEntriesByDose(
  scheduleId: string,
  scheduledDate: string
): Promise<void> {
  // On Android, alarms are tracked by deterministic request code — cancel via
  // the native module regardless of what is in the notification map.
  if (Platform.OS === "android") {
    await ExpoAlarm.cancelAlarm(scheduleId, scheduledDate);
  }

  const db = await getDb();
  const rows = await db.getAllAsync<NotifMapRow>(
    "SELECT * FROM notification_map WHERE schedule_id = ? AND scheduled_date = ?",
    [scheduleId, scheduledDate]
  );
  for (const row of rows) {
    await Notifications.cancelScheduledNotificationAsync(row.notif_id).catch(() => {});
  }
  await db.runAsync(
    "DELETE FROM notification_map WHERE schedule_id = ? AND scheduled_date = ?",
    [scheduleId, scheduledDate]
  );
}

export async function getNotifMapEntry(
  notifId: string
): Promise<NotificationMap[string] | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<NotifMapRow>(
      "SELECT * FROM notification_map WHERE notif_id = ?",
      [notifId]
    );
    if (!row) return null;
    return {
      doseLogId: row.dose_log_id,
      medicationId: row.medication_id,
      scheduleId: row.schedule_id,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
    };
  } catch {
    return null;
  }
}

// ─── Schedule a single notification ────────────────────────────────────────

async function scheduleOneNotification(
  medication: Medication,
  schedule: Schedule,
  fireDate: Date,
  isRepeat: boolean
): Promise<string> {
  const scheduledDate = toDateString(fireDate);

  const notifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: isRepeat
        ? i18n.t("notifications.repeatTitle", { name: medication.name })
        : i18n.t("notifications.reminderTitle", { name: medication.name }),
      body:
        (medication.notes
          ? i18n.t("notifications.bodyWithNotes", { dose: medication.dosage, notes: medication.notes })
          : i18n.t("notifications.body", { dose: medication.dosage }))
        + i18n.t("notifications.bodyActions"),
      sound: "alarm.wav",
      categoryIdentifier: "DOSE_REMINDER",
      data: {
        scheduleId: schedule.id,
        medicationId: medication.id,
        scheduledDate,
        scheduledTime: schedule.time,
        isRepeat,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: NOTIFICATION_CHANNEL_ID,
    },
  });

  return notifId;
}

// ─── Schedule a dose chain (initial + repeats) ─────────────────────────────

export async function scheduleDoseChain(
  medication: Medication,
  schedule: Schedule,
  scheduledDate: string
): Promise<void> {
  const { hours, minutes } = parseTime(schedule.time);
  const [year, month, day] = scheduledDate.split("-").map(Number);
  const baseDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

  // ── Android: use AlarmManager.setAlarmClock() ────────────────────────────
  // AlarmManager bypasses Doze mode, plays on STREAM_ALARM (sounds in silent
  // mode), and shows the full-screen alarm screen via deep link.
  // A single alarm per dose is sufficient — the alarm rings until dismissed.
  if (Platform.OS === "android") {
    await ExpoAlarm.scheduleAlarm({
      scheduleId:     schedule.id,
      medicationId:   medication.id,
      scheduledDate,
      scheduledTime:  schedule.time,
      medicationName: medication.name,
      dose:           medication.dosage,
      fireTimestamp:  baseDate.getTime(),
    });
    // Track in the notification map so rescheduleAllNotifications can detect
    // that this dose already has an alarm and not re-create one.
    await addNotifMapEntries([{
      notifId: `android-alarm:${schedule.id}:${scheduledDate}`,
      data: {
        doseLogId:     `${schedule.id}-${scheduledDate}`,
        medicationId:  medication.id,
        scheduleId:    schedule.id,
        scheduledDate,
        scheduledTime: schedule.time,
      },
    }]);
    return;
  }

  // ── iOS: expo-notifications chain (initial + repeats every 5 min) ────────
  const entries: { notifId: string; data: NotificationMap[string] }[] = [];
  const baseData: NotificationMap[string] = {
    doseLogId: `${schedule.id}-${scheduledDate}`,
    medicationId: medication.id,
    scheduleId: schedule.id,
    scheduledDate,
    scheduledTime: schedule.time,
  };

  // Initial notification
  const id0 = await scheduleOneNotification(medication, schedule, baseDate, false);
  entries.push({ notifId: id0, data: baseData });

  // Repeat notifications every REPEAT_INTERVAL_MINUTES
  for (let i = 1; i <= MAX_REPEATS; i++) {
    const fireDate = addMinutes(baseDate, i * REPEAT_INTERVAL_MINUTES);
    // Only schedule if in future
    if (fireDate > new Date()) {
      const id = await scheduleOneNotification(medication, schedule, fireDate, true);
      entries.push({ notifId: id, data: baseData });
    }
  }

  await addNotifMapEntries(entries);
}

// ─── Snooze: cancel chain + reschedule in N minutes ───────────────────────

export async function snoozeDose(
  medication: Medication,
  schedule: Schedule,
  scheduledDate: string,
  /** When provided the notification fires at this exact time instead of now+15. */
  fireDate?: Date
): Promise<void> {
  // Cancel existing alarm / notification chain for this dose.
  await removeNotifMapEntriesByDose(schedule.id, scheduledDate);

  // Use explicit fire date when supplied (future-dose snooze), otherwise now+15
  const snoozeDate = fireDate ?? addMinutes(new Date(), SNOOZE_MINUTES);

  // ── Android: re-schedule as an AlarmManager alarm ──────────────────────
  if (Platform.OS === "android") {
    // Use the actual fire time as the display time on the alarm screen so the
    // user sees the rescheduled time (e.g. 13:02) rather than the original
    // schedule time (e.g. 13:05) when they used "reschedule once" from Today.
    const displayTime = format(snoozeDate, "HH:mm");
    await ExpoAlarm.scheduleAlarm({
      scheduleId:     schedule.id,
      medicationId:   medication.id,
      scheduledDate,
      scheduledTime:  displayTime,
      medicationName: medication.name,
      dose:           medication.dosage,
      fireTimestamp:  snoozeDate.getTime(),
    });
    // Track in the notification map so rescheduleAllNotifications can detect
    // that this dose already has an alarm and not re-create one at the
    // original schedule time.
    await addNotifMapEntries([{
      notifId: `android-alarm:${schedule.id}:${scheduledDate}`,
      data: {
        doseLogId:     `${schedule.id}-${scheduledDate}`,
        medicationId:  medication.id,
        scheduleId:    schedule.id,
        scheduledDate,
        scheduledTime: displayTime,
      },
    }]);
    return;
  }

  // ── iOS: reschedule via expo-notifications ─────────────────────────────
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t("notifications.snoozeTitle", { name: medication.name }),
      body:
        (medication.notes
          ? i18n.t("notifications.bodyWithNotes", { dose: medication.dosage, notes: medication.notes })
          : i18n.t("notifications.body", { dose: medication.dosage }))
        + i18n.t("notifications.bodyActions"),
      sound: "alarm.wav",
      categoryIdentifier: "DOSE_REMINDER",
      data: {
        scheduleId: schedule.id,
        medicationId: medication.id,
        scheduledDate,
        scheduledTime: schedule.time,
        isSnooze: true,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozeDate,
      channelId: NOTIFICATION_CHANNEL_ID,
    },
  });

  await addNotifMapEntries([
    {
      notifId: id,
      data: {
        doseLogId: `${schedule.id}-${scheduledDate}`,
        medicationId: medication.id,
        scheduleId: schedule.id,
        scheduledDate,
        // Store the actual snooze fire-time so that when the user marks it
        // "taken" from the notification, the log records the snoozed time
        // rather than the original schedule time.
        scheduledTime: format(snoozeDate, "HH:mm"),
      },
    },
  ]);
}

// ─── Cancel all notifications for a dose ──────────────────────────────────

export async function cancelDoseNotifications(
  scheduleId: string,
  scheduledDate: string
): Promise<void> {
  await removeNotifMapEntriesByDose(scheduleId, scheduledDate);
}

// ─── Schedule all doses for the next N days ───────────────────────────────

export async function scheduleAllUpcoming(
  medications: Medication[],
  schedules: Schedule[]
): Promise<void> {
  const dates = getNextDates(DAYS_AHEAD);
  const medMap = new Map(medications.map((m) => [m.id, m]));

  for (const schedule of schedules) {
    const med = medMap.get(schedule.medicationId);
    if (!med) continue;

    for (const date of dates) {
      if (!isScheduleActiveOnDate(schedule, date, med)) continue;

      const scheduledDate = toDateString(date);
      const { hours, minutes } = parseTime(schedule.time);
      const fireDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hours,
        minutes
      );

      // Only schedule future notifications
      if (fireDate <= new Date()) continue;

      await scheduleDoseChain(med, schedule, scheduledDate);
    }
  }
}

// ─── Cancel ALL scheduled notifications ────────────────────────────────────

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const db = await getDb();
  await db.runAsync("DELETE FROM notification_map");
}

// ─── Stock-alert notification (immediate, informational) ────────────────────

export const STOCK_ALERT_CHANNEL_ID = "stock-alerts";

export async function setupStockAlertChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(STOCK_ALERT_CHANNEL_ID, {
    name: i18n.t("stock.channelName"),
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lightColor: "#f97316",
  });
}

/**
 * Fires an immediate local notification informing the user that their stock
 * for `medication` is running low.
 */
export async function scheduleStockAlert(medication: Medication): Promise<void> {
  if (Platform.OS === "web") return;
  const count = medication.stockQuantity ?? 0;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t("stock.alertTitle", { name: medication.name }),
      body: i18n.t("stock.alertBody", { count }),
      data: { type: "stock_alert", medicationId: medication.id },
      ...(Platform.OS === "android" ? { channelId: STOCK_ALERT_CHANNEL_ID } : {}),
    },
    trigger: null, // immediate
  });
}

// ─── Appointment notifications ─────────────────────────────────────────────

export const APPOINTMENTS_CHANNEL_ID = "appointment-reminders";

export async function setupAppointmentChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(APPOINTMENTS_CHANNEL_ID, {
    name: i18n.t("appointments.title"),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: "#4f9cff",
    sound: "default",
  });
}

/**
 * Schedules reminders for the given appointment.
 * - A configurable reminder N minutes before (when reminderMinutes > 0).
 * - A "heads-up" at the exact appointment time (when appt.time is set).
 *
 * Returns a pipe-separated string of notification IDs to store for
 * later cancellation, or undefined if nothing could be scheduled.
 */
export async function scheduleAppointmentNotification(
  appt: Appointment
): Promise<string | undefined> {
  if (Platform.OS === "web") return undefined;

  const [year, month, day] = appt.date.split("-").map(Number);
  const [hour, minute] = appt.time ? appt.time.split(":").map(Number) : [9, 0];
  const apptDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  const now = new Date();

  const ids: string[] = [];

  // ── Configurable reminder (N minutes before) ──────────────────────────────
  if (appt.reminderMinutes && appt.reminderMinutes > 0) {
    const fireDate = new Date(apptDate.getTime() - appt.reminderMinutes * 60_000);
    if (fireDate > now) {
      const reminderId = await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t("appointments.notifTitle"),
          body: i18n.t("appointments.notifBody", { title: appt.title }),
          data: { type: "appointment", appointmentId: appt.id },
          ...(Platform.OS === "android" ? { channelId: APPOINTMENTS_CHANNEL_ID } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
      ids.push(reminderId);
    }
  }

  // ── Heads-up at appointment time (only when a specific time is set) ────────
  if (appt.time && apptDate > now) {
    const headsUpBody =
      [appt.doctor, appt.location].filter(Boolean).join(" · ") ||
      i18n.t("appointments.notifHeadsUpBody");
    const headsUpId = await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t("appointments.notifHeadsUpTitle", { title: appt.title }),
        body: headsUpBody,
        data: { type: "appointment_headsup", appointmentId: appt.id },
        ...(Platform.OS === "android" ? { channelId: APPOINTMENTS_CHANNEL_ID } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: apptDate },
    });
    ids.push(headsUpId);
  }

  return ids.length > 0 ? ids.join("|") : undefined;
}

export async function cancelAppointmentNotification(notificationId: string): Promise<void> {
  // notificationId may be pipe-separated when both a reminder and a heads-up
  // were scheduled (e.g. "id1|id2").
  const ids = notificationId.split("|");
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

// ─── Health measurement reminder ───────────────────────────────────────────────────

export const HEALTH_CHANNEL_ID = "health-reminders";
const HEALTH_NOTIF_ID_KEY = "@pilloclock/health_reminder_notif_id";
const HEALTH_REMINDER_TIME_KEY = "@pilloclock/health_reminder_time";

export async function setupHealthReminderChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(HEALTH_CHANNEL_ID, {
    name: i18n.t("health.channelName"),
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lightColor: "#22c55e",
  });
}

export async function getHealthReminderTime(): Promise<string | null> {
  return AsyncStorage.getItem(HEALTH_REMINDER_TIME_KEY);
}

export async function scheduleHealthReminder(time: string): Promise<void> {
  if (Platform.OS === "web") return;
  // Cancel the previous one first.
  try {
    const existingId = await AsyncStorage.getItem(HEALTH_NOTIF_ID_KEY);
    if (existingId) await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
  } catch {}
  const [hour, minute] = time.split(":").map(Number);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t("health.notifTitle"),
      body: i18n.t("health.notifBody"),
      data: { type: "health_reminder" },
      ...(Platform.OS === "android" ? { channelId: HEALTH_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  await AsyncStorage.setItem(HEALTH_NOTIF_ID_KEY, id);
  await AsyncStorage.setItem(HEALTH_REMINDER_TIME_KEY, time);
}

export async function cancelHealthReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const existingId = await AsyncStorage.getItem(HEALTH_NOTIF_ID_KEY);
    if (existingId) await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => {});
    await AsyncStorage.removeItem(HEALTH_NOTIF_ID_KEY);
    await AsyncStorage.removeItem(HEALTH_REMINDER_TIME_KEY);
  } catch {}
}

export async function cancelScheduleNotifications(scheduleId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<NotifMapRow>(
    "SELECT * FROM notification_map WHERE schedule_id = ?",
    [scheduleId]
  );
  for (const row of rows) {
    await Notifications.cancelScheduledNotificationAsync(row.notif_id).catch(() => {});
  }
  await db.runAsync("DELETE FROM notification_map WHERE schedule_id = ?", [scheduleId]);
}

// ─── Cleanup expired NotificationMap entries ──────────────────────────────

/**
 * Removes notification map entries whose scheduledDate is before today.
 * Old entries accumulate over time because they are only deleted when the
 * user acts on a dose. Call this from the background task and on app resume.
 */
export async function cleanupExpiredNotifMapEntries(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const today = toDateString(new Date());
    const db = await getDb();
    await db.runAsync(
      "DELETE FROM notification_map WHERE scheduled_date < ?",
      [today]
    );
  } catch {
    // Non-critical — swallow so callers never fail due to this.
  }
}

// ─── Reschedule all active notifications ───────────────────────────────────

/**
 * Idempotent: checks the NotificationMap before scheduling, so calling this
 * function multiple times won't create duplicates for already-tracked doses.
 */
export async function rescheduleAllNotifications(): Promise<void> {
  if (Platform.OS === "web") return;

  // Purge stale entries first so the map doesn't grow indefinitely.
  await cleanupExpiredNotifMapEntries();

  const now = new Date();
  const todayStr = toDateString(now);
  const endStr   = toDateString(addDays(now, 7));

  const db = await getDb();
  const [medications, schedules, mappedRows, logs] = await Promise.all([
    getMedications(),
    getAllActiveSchedules(),
    db.getAllAsync<{ schedule_id: string; scheduled_date: string }>(
      "SELECT DISTINCT schedule_id, scheduled_date FROM notification_map"
    ),
    getDoseLogsByDateRange(todayStr, endStr),
  ]);

  const scheduledKeys = new Set(
    mappedRows.map((r) => `${r.schedule_id}:${r.scheduled_date}`)
  );

  // Doses that are already resolved (taken / skipped / missed) must not be
  // re-scheduled.  This is particularly important on Android where alarms are
  // NOT stored in the notification map, so a rescheduled-then-resolved dose
  // would otherwise get a fresh alarm at its original schedule.time.
  const resolvedKeys = new Set(
    logs
      .filter((l) => l.status !== "pending")
      .map((l) => `${l.scheduleId}:${l.scheduledDate}`)
  );

  for (const sched of schedules) {
    const med = medications.find((m) => m.id === sched.medicationId);
    if (!med || !med.isActive) continue;

    for (let i = 0; i < 7; i++) {
      const date = addDays(startOfDay(now), i);
      if (!isScheduleActiveOnDate(sched, date, med)) continue;

      const scheduledDate = toDateString(date);

      // Already tracked in the notification map (iOS) → skip.
      if (scheduledKeys.has(`${sched.id}:${scheduledDate}`)) continue;

      // Already resolved by the user → never re-alarm.
      if (resolvedKeys.has(`${sched.id}:${scheduledDate}`)) continue;

      const [h, m] = sched.time.split(":").map(Number);
      const fireDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
      if (fireDate <= now) continue;

      await scheduleDoseChain(med, sched, scheduledDate);
    }
  }
}
