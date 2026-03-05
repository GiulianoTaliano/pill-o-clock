import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { addDays, addMinutes, startOfDay } from "date-fns";
import { Schedule, Medication, NotificationMap } from "../types";
import { parseTime, isScheduleActiveOnDate, getNextDates, toDateString } from "../utils";
import i18n from "../i18n";
import { getMedications, getAllActiveSchedules } from "../db/database";

// ─── Constants ─────────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNEL_ID = "pill-reminders-v2";
// v2: correct sound reference (alarm.wav) + bypassDnd. Android channel settings are
// immutable after creation, so a new ID forces a fresh channel on existing devices.
export const SNOOZE_MINUTES = 15;
export const REPEAT_INTERVAL_MINUTES = 5;
/** How many repeat reminders before giving up (5, 10, 15, 20 min after first) */
export const MAX_REPEATS = 4;
/** How many days ahead to schedule notifications */
const DAYS_AHEAD = 7;

const NOTIF_MAP_KEY = "@pilloclock/notif_map";

// ─── Notification Actions ──────────────────────────────────────────────────

export const ACTION_TAKEN = "TAKEN";
export const ACTION_SNOOZE = "SNOOZE";
export const ACTION_SKIP = "SKIP";

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

  // Configure handler for foreground notifications
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
      // alarm.wav is bundled via app.json > plugins > expo-notifications > sounds.
      // Using the filename with extension correctly resolves to res/raw/alarm.
      sound: "alarm.wav",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      bypassDnd: true,        // bypass Do Not Disturb for critical reminders
    });
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

// ─── Notification Map helpers ──────────────────────────────────────────────

async function loadNotifMap(): Promise<NotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export { loadNotifMap };

async function saveNotifMap(map: NotificationMap): Promise<void> {
  await AsyncStorage.setItem(NOTIF_MAP_KEY, JSON.stringify(map));
}

export async function addNotifMapEntries(
  entries: { notifId: string; data: NotificationMap[string] }[]
): Promise<void> {
  const map = await loadNotifMap();
  for (const { notifId, data } of entries) {
    map[notifId] = data;
  }
  await saveNotifMap(map);
}

export async function removeNotifMapEntriesByDose(
  scheduleId: string,
  scheduledDate: string
): Promise<void> {
  const map = await loadNotifMap();
  for (const notifId of Object.keys(map)) {
    const e = map[notifId];
    if (e.scheduleId === scheduleId && e.scheduledDate === scheduledDate) {
      delete map[notifId];
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
    }
  }
  await saveNotifMap(map);
}

export async function getNotifMapEntry(
  notifId: string
): Promise<NotificationMap[string] | null> {
  const map = await loadNotifMap();
  return map[notifId] ?? null;
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
  // Cancel existing chain
  await removeNotifMapEntriesByDose(schedule.id, scheduledDate);

  // Use explicit fire date when supplied (future-dose snooze), otherwise now+15
  const snoozeDate = fireDate ?? addMinutes(new Date(), SNOOZE_MINUTES);

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
        scheduledTime: schedule.time,
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
  await AsyncStorage.removeItem(NOTIF_MAP_KEY);
}

// ─── Cancel notifications for a specific schedule ─────────────────────────

export async function cancelScheduleNotifications(scheduleId: string): Promise<void> {
  const map = await loadNotifMap();
  const toCancel = Object.entries(map).filter(([, v]) => v.scheduleId === scheduleId);
  for (const [notifId] of toCancel) {
    await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
    delete map[notifId];
  }
  await saveNotifMap(map);
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
    const map = await loadNotifMap();
    const expired = Object.keys(map).filter((k) => map[k].scheduledDate < today);
    if (expired.length === 0) return;
    for (const notifId of expired) {
      delete map[notifId];
    }
    await saveNotifMap(map);
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

  const [medications, schedules, map] = await Promise.all([
    getMedications(),
    getAllActiveSchedules(),
    loadNotifMap(),
  ]);

  const scheduledKeys = new Set(
    Object.values(map).map((e) => `${e.scheduleId}:${e.scheduledDate}`)
  );

  const now = new Date();

  for (const sched of schedules) {
    const med = medications.find((m) => m.id === sched.medicationId);
    if (!med || !med.isActive) continue;

    for (let i = 0; i < 7; i++) {
      const date = addDays(startOfDay(now), i);
      if (!isScheduleActiveOnDate(sched, date, med)) continue;

      const scheduledDate = toDateString(date);
      if (scheduledKeys.has(`${sched.id}:${scheduledDate}`)) continue;

      const [h, m] = sched.time.split(":").map(Number);
      const fireDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
      if (fireDate <= now) continue;

      await scheduleDoseChain(med, sched, scheduledDate);
    }
  }
}
