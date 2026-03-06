import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { addMinutes, format } from "date-fns";
import { useAppStore } from "../store";
import {
  ACTION_TAKEN,
  ACTION_SNOOZE,
  ACTION_SKIP,
  SNOOZE_MINUTES,
  getNotifMapEntry,
  snoozeDose as snoozeDoseService,
} from "../services/notifications";
import { TodayDose } from "../types";

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
    if (Platform.OS === "web") return;
    listenerRef.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const actionId = response.actionIdentifier;
        const notifId = response.notification.request.identifier;

        const entry = await getNotifMapEntry(notifId);
        if (!entry) return;

        const { scheduleId, medicationId, scheduledDate, scheduledTime } = entry;

        // Always read fresh state — never rely on closure-captured values.
        const { medications, schedules, markDose, loadTodayLogs } = useAppStore.getState();
        const med = medications.find((m) => m.id === medicationId);
        const schedule = schedules.find((s) => s.id === scheduleId);

        // Dismiss the delivered notification from the tray.
        // cancelScheduledNotificationAsync only cancels future ones; this removes
        // the notification that the user just interacted with.
        await Notifications.dismissNotificationAsync(notifId).catch(() => {});

        if (actionId === ACTION_TAKEN) {
          // Route through the store action so stock is decremented correctly.
          if (!med || !schedule) return;
          const dose: TodayDose = {
            medication: med,
            schedule,
            scheduledDate,
            // scheduledTime here comes from the notif-map entry, which reflects
            // the actual snooze time after the snoozeDose service fix.
            scheduledTime,
            status: "pending",
          };
          await markDose(dose, "taken");
        } else if (actionId === ACTION_SNOOZE) {
          // Snooze needs the full medication/schedule objects.
          if (!med || !schedule) return;
          const snoozeDate = addMinutes(new Date(), SNOOZE_MINUTES);
          await snoozeDoseService(med, schedule, scheduledDate);
          // Update the in-memory snoozedTimes so the Home screen shows the new time.
          const snoozeHHmm = format(snoozeDate, "HH:mm");
          const doseKey = `${scheduleId}-${scheduledDate}`;
          useAppStore.setState((s) => ({
            snoozedTimes: { ...s.snoozedTimes, [doseKey]: snoozeHHmm },
          }));
          await loadTodayLogs();
        } else if (actionId === ACTION_SKIP) {
          // Route through the store action for consistency.
          if (!med || !schedule) return;
          const dose: TodayDose = {
            medication: med,
            schedule,
            scheduledDate,
            scheduledTime,
            status: "pending",
          };
          await markDose(dose, "skipped");
        }
        // DEFAULT_ACTION_IDENTIFIER (tap on banner without choosing an action):
        // simply open the app without modifying any dose log.
      }
    );

    return () => {
      listenerRef.current?.remove();
    };
  }, []); // stable: reads live state via getState()
}
