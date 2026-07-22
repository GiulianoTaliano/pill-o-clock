/**
 * User-configurable default snooze interval (audit/backlog F1).
 *
 * Kept in its own module (instead of notifications.ts) so consumers that only
 * need the setting — store slices, DoseCard, the alarm screen — don't pull in
 * the whole notifications service (heavy expo imports, widely jest.mock()ed).
 *
 * The value is what the ⏰ Snooze quick-action on the notification uses, and
 * what the per-dose pickers pre-select. Reads are synchronous (MMKV).
 */
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

/** Options offered by every snooze picker, in minutes. */
export const SNOOZE_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60] as const;

/** Fallback when the user never changed the setting. */
export const DEFAULT_SNOOZE_MINUTES = 15;

/**
 * Current default snooze interval in minutes.
 * Falls back to DEFAULT_SNOOZE_MINUTES when unset or invalid.
 */
export function getDefaultSnoozeMinutes(): number {
  const raw = storage.getString(STORAGE_KEYS.SNOOZE_MINUTES);
  if (!raw) return DEFAULT_SNOOZE_MINUTES;
  const parsed = Number(raw);
  return (SNOOZE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_SNOOZE_MINUTES;
}

/**
 * Persists a new default snooze interval.
 * Throws on values outside SNOOZE_OPTIONS (programmer error — the UI only
 * offers valid options).
 *
 * Note: after changing it, call refreshDoseReminderCategory() (notifications
 * service) so the notification action button label shows the new interval.
 */
export function setDefaultSnoozeMinutes(minutes: number): void {
  if (!(SNOOZE_OPTIONS as readonly number[]).includes(minutes)) {
    throw new Error(`Invalid snooze interval: ${minutes}`);
  }
  storage.set(STORAGE_KEYS.SNOOZE_MINUTES, String(minutes));
}
