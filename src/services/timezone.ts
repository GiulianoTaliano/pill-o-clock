/**
 * Timezone-travel reliability (F3).
 *
 * Schedules are wall-clock ("08:00 wherever I am"), but queued Android
 * alarms and iOS notifications are absolute instants computed in the zone
 * where they were scheduled. After a timezone change those instants land at
 * the wrong local time. rescheduleAllNotifications() calls
 * detectTimezoneChange() on every app foreground: when the zone changed,
 * everything queued is cancelled and rebuilt at the new local wall-clock
 * times, and the user is told it happened.
 */
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

export function getDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    /* Intl unavailable — fall through to the offset form */
  }
  return `UTC${-new Date().getTimezoneOffset() / 60}`;
}

export interface TimezoneChange {
  changed: boolean;
  from?: string;
  to: string;
}

/**
 * Compares the device timezone with the last one seen and persists the
 * current one. First run is never a "change". `current` is injectable for
 * tests.
 */
export function detectTimezoneChange(current?: string): TimezoneChange {
  const to = current ?? getDeviceTimezone();
  const from = storage.getString(STORAGE_KEYS.LAST_TIMEZONE);
  storage.set(STORAGE_KEYS.LAST_TIMEZONE, to);
  if (!from || from === to) return { changed: false, to };
  return { changed: true, from, to };
}
