import { format } from "date-fns";
import { updateWidget, type WidgetData } from "expo-widget";
import i18n from "../i18n";
import type { TodayDose } from "../types";
import { formatSnoozedTime } from "./doseTime";
import { formatTimeForDisplay } from "../utils";

export function buildCareWidgetData(
  doses: TodayDose[],
  person: string
): WidgetData {
  const pending = doses.find((d) => d.status === "pending");
  const missing = doses.filter((d) => d.status === "missed");
  const taken = doses.length > 0 && doses.every((d) => d.status === "taken");
  const completed =
    doses.length > 0 &&
    doses.every((d) => d.status === "taken" || d.status === "skipped");
  const next = pending ?? missing[0];
  return {
    name: next?.medication.name ?? null,
    time: next
      ? next.snoozedUntil
        ? formatSnoozedTime(next.snoozedUntil)
        : formatTimeForDisplay(next.scheduledTime)
      : null,
    allDone: taken,
    title:
      next?.medication.name ??
      i18n.t(
        taken
          ? "ux.widgetDone"
          : completed
          ? "ux.widgetRecorded"
          : "ux.widgetEmpty"
      ),
    subtitle: next
      ? [
          i18n.t(
            next.status === "missed" ? "ux.unregistered" : "ux.widgetTitle"
          ),
          next.snoozedUntil
            ? formatSnoozedTime(next.snoozedUntil)
            : formatTimeForDisplay(next.scheduledTime),
        ].join(" · ")
      : "",
    profile: person,
    date: format(new Date(), "yyyy-MM-dd"),
    fallbackText: i18n.t("ux.widgetOpen"),
  };
}
export function updateCareWidget(doses: TodayDose[], person: string) {
  return updateWidget(buildCareWidgetData(doses, person));
}
