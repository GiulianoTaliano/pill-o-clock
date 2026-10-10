import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Sentry from "@sentry/react-native";
import { useAppStore } from "../store";
import {
  ACTION_TAKEN,
  ACTION_SNOOZE,
  ACTION_SKIP,
  getNotifMapEntry,
} from "../services/notifications";
import { getMedicationById, getSchedulesByMedication } from "../db/database";
import { withEffectiveDose } from "../services/regimen";
import { SavedDoseError } from "../store/slices/medications";
import i18n from "../i18n";
import type { TodayDose } from "../types";

/** Register only after database bootstrap; recover the response that launched the app. */
export function useNotificationResponseHandler(enabled = true) {
  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let live = true;
    const handle = async (response: Notifications.NotificationResponse) => {
      if (!live) return;
      const actionId = response.actionIdentifier;
      const request = response.notification.request;
      const key = `${request.identifier}:${actionId}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      try {
        const data = request.content.data;
        if (
          data?.type === "appointment" ||
          data?.type === "appointment_headsup"
        ) {
          if (typeof data.appointmentId === "string")
            useAppStore.getState().setSelectedAppointmentId(data.appointmentId);
        } else if (
          [ACTION_TAKEN, ACTION_SKIP, ACTION_SNOOZE].includes(actionId)
        ) {
          const entry = await getNotifMapEntry(request.identifier);
          if (!entry || !live) return;
          const { scheduleId, medicationId, scheduledDate, scheduledTime } =
            entry;
          const state = useAppStore.getState();
          const medication =
            state.medications.find((item) => item.id === medicationId) ??
            (await getMedicationById(medicationId));
          const schedule =
            state.schedules.find((item) => item.id === scheduleId) ??
            (await getSchedulesByMedication(medicationId)).find(
              (item) => item.id === scheduleId
            );
          if (!live) return;
          if (!medication || !schedule)
            throw new Error("Notification treatment missing");
          const dose: TodayDose = {
            medication: withEffectiveDose(medication, scheduledDate),
            schedule,
            scheduledDate,
            scheduledTime,
            status: "pending",
            snoozedUntil: state.snoozedTimes[`${scheduleId}-${scheduledDate}`],
          };
          if (actionId === ACTION_SNOOZE) {
            if (
              !medication.isActive ||
              !schedule.isActive ||
              medication.archivedAt
            )
              return;
            await state.snoozeDose(dose);
          } else
            await state.markDose(
              dose,
              actionId === ACTION_TAKEN ? "taken" : "skipped"
            );
        }
        await Notifications.dismissNotificationAsync(request.identifier).catch(
          () => {}
        );
        await Notifications.clearLastNotificationResponseAsync().catch(
          () => {}
        );
      } catch (error) {
        Sentry.captureException(error, {
          tags: {
            action: "notification_response",
            saved: error instanceof SavedDoseError ? "true" : "false",
          },
        });
        // A failed stored action must not silently replay on every launch.
        await Notifications.clearLastNotificationResponseAsync().catch(
          () => {}
        );
        if (live)
          Alert.alert(
            i18n.t(
              error instanceof SavedDoseError
                ? "uxMedication.registered"
                : "common.error"
            ),
            i18n.t(
              error instanceof SavedDoseError
                ? "uxMedication.registeredWarning"
                : "uxMedication.operationError"
            )
          );
      }
    };
    const listener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handle(response);
      }
    );
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) return handle(response);
      })
      .catch((error) => {
        Sentry.captureException(error, {
          tags: { action: "notification_response_recovery" },
        });
      });
    return () => {
      live = false;
      listener.remove();
    };
  }, [enabled]);
}
