import { format } from "date-fns";
import { getDateLocale } from "../i18n";
import { formatTimeForDisplay, today } from "../utils";

/** Snoozes retain their original dose key, even when the fire time is tomorrow. */
export function effectiveDoseDateTime(
  date: string,
  time: string,
  snoozedUntil?: string
): Date {
  if (snoozedUntil && snoozedUntil.includes("T")) {
    const parsed = new Date(snoozedUntil);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const hhmm =
    snoozedUntil && /^\d{2}:\d{2}$/.test(snoozedUntil) ? snoozedUntil : time;
  return new Date(date + "T" + hhmm + ":00");
}

export function formatSnoozedTime(value: string): string {
  if (!value.includes("T")) return formatTimeForDisplay(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = formatTimeForDisplay(format(date, "HH:mm"));
  return format(date, "yyyy-MM-dd") === today()
    ? time
    : format(date, "d MMM", { locale: getDateLocale() }) + " · " + time;
}
