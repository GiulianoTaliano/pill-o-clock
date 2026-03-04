import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useAppStore } from "../store";
import {
  ACTION_TAKEN,
  ACTION_SNOOZE,
  ACTION_SKIP,
  getNotifMapEntry,
  cancelDoseNotifications,
  snoozeDose as snoozeDoseService,
} from "../services/notifications";
import {
  generateId,
  toISOString,
} from "../utils";
import { upsertDoseLog } from "../db/database";
import { DoseLog } from "../types";

/**
 * Registers a notification response listener.
 * Handles TAKEN, SNOOZE, SKIP actions globally.
 *
 * Uses useAppStore.getState() inside the callback so it always reads the
 * freshest store data — avoids stale-closure issues when the effect runs
 * once at mount while the store is still loading.
 */
export function useNotificationResponseHandler() {
  const listenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    listenerRef.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const actionId = response.actionIdentifier;
        const notifId = response.notification.request.identifier;

        const entry = await getNotifMapEntry(notifId);
        if (!entry) return;

        const { scheduleId, medicationId, scheduledDate, scheduledTime } = entry;

        // Always read fresh state — never rely on closure-captured values.
        const { medications, schedules, loadTodayLogs } = useAppStore.getState();
        const med = medications.find((m) => m.id === medicationId);
        const schedule = schedules.find((s) => s.id === scheduleId);

        if (
          actionId === ACTION_TAKEN ||
          actionId === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
          const now = new Date();
          const log: DoseLog = {
            id: generateId(),
            medicationId,
            scheduleId,
            scheduledDate,
            scheduledTime,
            status: "taken",
            takenAt: toISOString(now),
            createdAt: toISOString(now),
          };
          await upsertDoseLog(log);
          await cancelDoseNotifications(scheduleId, scheduledDate);
          await loadTodayLogs();
        } else if (actionId === ACTION_SNOOZE) {
          // Snooze needs the full medication/schedule objects.
          if (!med || !schedule) return;
          await snoozeDoseService(med, schedule, scheduledDate);
        } else if (actionId === ACTION_SKIP) {
          const now = new Date();
          const log: DoseLog = {
            id: generateId(),
            medicationId,
            scheduleId,
            scheduledDate,
            scheduledTime,
            status: "skipped",
            createdAt: toISOString(now),
          };
          await upsertDoseLog(log);
          await cancelDoseNotifications(scheduleId, scheduledDate);
          await loadTodayLogs();
        }
      }
    );

    return () => {
      listenerRef.current?.remove();
    };
  }, []); // stable: reads live state via getState()
}
