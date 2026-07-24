/**
 * __tests__/services/iosNotificationBudget.test.ts
 *
 * iOS caps an app at 64 PENDING local notifications. Past that, iOS keeps the
 * 64 soonest-firing ones and silently drops the rest — for this app that means
 * medication reminders that never ring, with no error anywhere.
 *
 * The budget is governed by two constants in the notifications service:
 *   notifications per dose = 1 initial + MAX_REPEATS repeats
 *   doses per schedule     = DAYS_AHEAD
 *   total                  = schedules × DAYS_AHEAD × (1 + MAX_REPEATS)
 *
 * These tests measure the real number of scheduleNotificationAsync calls so the
 * limit is a checked fact rather than a comment, and so that raising DAYS_AHEAD
 * or MAX_REPEATS fails here instead of silently dropping doses on a user's
 * phone.
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// ─── Mocks ────────────────────────────────────────────────────────────────

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn().mockResolvedValue(undefined),
  ActivityAction: {},
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

const mockDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  withTransactionAsync: jest.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
};

jest.mock("../../src/db/database", () => ({
  getDb: jest.fn().mockImplementation(() => Promise.resolve(mockDb)),
  getMedications: jest.fn().mockResolvedValue([]),
  getAllActiveSchedules: jest.fn().mockResolvedValue([]),
  getDoseLogsByDateRange: jest.fn().mockResolvedValue([]),
  getProfiles: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../src/i18n", () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: "es" },
  t: (k: string) => k,
}));

jest.mock("../../src/config", () => ({
  STORAGE_KEYS: {
    NOTIF_MAP: "notifMap",
    EXACT_ALARM_PROMPTED: "exactAlarmPrompted",
    FULLSCREEN_INTENT_PROMPTED: "fullscreenIntentPrompted",
  },
}));

// Three consecutive days, far enough in the future that every dose (and every
// repeat) is still ahead of "now" and therefore actually gets scheduled.
const mockFutureDates = [
  new Date(2099, 0, 1),
  new Date(2099, 0, 2),
  new Date(2099, 0, 3),
];

jest.mock("../../src/utils", () => ({
  parseTime: (t: string) => {
    const [hours, minutes] = t.split(":").map(Number);
    return { hours, minutes };
  },
  isScheduleActiveOnDate: jest.fn().mockReturnValue(true),
  getNextDates: jest.fn().mockImplementation(() => mockFutureDates),
  toDateString: (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  getLocalizedDosage: () => "1 tab.",
  getProfileLabel: () => "",
}));

jest.mock("../../src/services/regimen", () => ({
  withEffectiveDose: (m: unknown) => m,
}));

// ─── Import after mocks ──────────────────────────────────────────────────

import {
  scheduleAllUpcoming,
  DAYS_AHEAD,
  MAX_REPEATS,
} from "../../src/services/notifications";
import type { Medication, Schedule } from "../../src/types";

// ─── Helpers ─────────────────────────────────────────────────────────────

/** iOS hard limit on pending local notifications, app-wide. */
const IOS_NOTIFICATION_CAP = 64;

function makeMedication(i: number): Medication {
  return { id: `med-${i}`, name: `Med ${i}`, isActive: true } as Medication;
}

function makeSchedule(i: number): Schedule {
  return { id: `sch-${i}`, medicationId: `med-${i}`, time: "08:00" } as Schedule;
}

async function countScheduledFor(scheduleCount: number): Promise<number> {
  (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();

  const meds = Array.from({ length: scheduleCount }, (_, i) => makeMedication(i));
  const schedules = Array.from({ length: scheduleCount }, (_, i) => makeSchedule(i));

  await scheduleAllUpcoming(meds, schedules);

  return (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("iOS notification budget", () => {
  beforeEach(() => {
    (Platform as any).OS = "ios";
    jest.clearAllMocks();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue("notif-id");
  });

  it("uses the conservative iOS constants", () => {
    expect(DAYS_AHEAD).toBe(3);
    expect(MAX_REPEATS).toBe(2);
  });

  it("schedules (1 + MAX_REPEATS) notifications per dose", async () => {
    const used = await countScheduledFor(1);
    expect(used).toBe(DAYS_AHEAD * (1 + MAX_REPEATS));
  });

  it("stays within the 64-notification cap at 7 schedules", async () => {
    const used = await countScheduledFor(7);
    expect(used).toBeLessThanOrEqual(IOS_NOTIFICATION_CAP);
  });

  /**
   * Documents the ceiling. With the current constants each schedule costs 9
   * slots, so the 8th schedule (72 slots) already exceeds the cap — BEFORE
   * appointment, renewal and health reminders take their share.
   *
   * This is not a hypothetical load for this app: polypharmacy in elderly
   * patients routinely means 8+ concurrent medications. When this fails,
   * doses are being dropped silently on real devices.
   */
  it("EXCEEDS the cap at 8 schedules — known limitation", async () => {
    const used = await countScheduledFor(8);
    expect(used).toBeGreaterThan(IOS_NOTIFICATION_CAP);
  });

  it("does not consume notification slots on Android", async () => {
    (Platform as any).OS = "android";
    const used = await countScheduledFor(8);
    // Android uses the native AlarmManager path instead.
    expect(used).toBe(0);
  });
});
