/**
 * __tests__/factories.ts
 * Deterministic test-data factories for Pill O-Clock domain types.
 * Keeps test payloads minimal and easy to override with per-case overrides.
 */

import type { Medication, Schedule, DoseLog, TodayDose } from "../src/types";

// ─── Medication ────────────────────────────────────────────────────────────

export function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Ibuprofen",
    dosageAmount: 400,
    dosageUnit: "mg",
    dosage: "400 mg",
    category: "analgesico",
    color: "blue",
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Schedule ──────────────────────────────────────────────────────────────

export function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sch-1",
    medicationId: "med-1",
    time: "08:00",
    days: [], // empty = daily
    isActive: true,
    ...overrides,
  };
}

// ─── DoseLog ───────────────────────────────────────────────────────────────

export function makeDoseLog(overrides: Partial<DoseLog> = {}): DoseLog {
  return {
    id: "log-1",
    medicationId: "med-1",
    scheduleId: "sch-1",
    scheduledDate: "2025-06-16",
    scheduledTime: "08:00",
    status: "taken",
    takenAt: "2025-06-16T08:05:00.000Z",
    createdAt: "2025-06-16T08:05:00.000Z",
    ...overrides,
  };
}

// ─── TodayDose ─────────────────────────────────────────────────────────────

export function makeTodayDose(overrides: Partial<TodayDose> = {}): TodayDose {
  const medication = overrides.medication ?? makeMedication();
  const schedule = overrides.schedule ?? makeSchedule();
  return {
    medication,
    schedule,
    scheduledDate: "2025-06-16",
    scheduledTime: "08:00",
    status: "pending",
    ...overrides,
  };
}
