/**
 * Web-specific database implementation.
 * Uses localStorage for persistence so data survives page refreshes.
 * Metro automatically picks this file over database.ts on the web platform.
 */

import {
  Medication,
  Schedule,
  DoseLog,
  DoseStatus,
} from "../types";

// ─── LocalStorage helpers ──────────────────────────────────────────────────

const KEYS = {
  medications: "pilloclock:medications",
  schedules: "pilloclock:schedules",
  doseLogs: "pilloclock:dose_logs",
};

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Init (no-op on web) ───────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  // Nothing to initialise – localStorage is always available.
}

// ─── Medications ───────────────────────────────────────────────────────────

export async function getMedications(): Promise<Medication[]> {
  return load<Medication>(KEYS.medications).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getMedicationById(
  id: string
): Promise<Medication | null> {
  return load<Medication>(KEYS.medications).find((m) => m.id === id) ?? null;
}

export async function insertMedication(med: Medication): Promise<void> {
  const all = load<Medication>(KEYS.medications);
  all.push(med);
  save(KEYS.medications, all);
}

export async function updateMedication(med: Medication): Promise<void> {
  const all = load<Medication>(KEYS.medications).map((m) =>
    m.id === med.id ? med : m
  );
  save(KEYS.medications, all);
}

export async function deleteMedication(id: string): Promise<void> {
  save(
    KEYS.medications,
    load<Medication>(KEYS.medications).filter((m) => m.id !== id)
  );
  // Cascade: remove schedules and their dose logs
  const schedules = load<Schedule>(KEYS.schedules).filter(
    (s) => s.medicationId === id
  );
  save(
    KEYS.schedules,
    load<Schedule>(KEYS.schedules).filter((s) => s.medicationId !== id)
  );
  const scheduleIds = new Set(schedules.map((s) => s.id));
  save(
    KEYS.doseLogs,
    load<DoseLog>(KEYS.doseLogs).filter(
      (l) => !scheduleIds.has(l.scheduleId)
    )
  );
}

// ─── Schedules ─────────────────────────────────────────────────────────────

export async function getSchedulesByMedication(
  medicationId: string
): Promise<Schedule[]> {
  return load<Schedule>(KEYS.schedules)
    .filter((s) => s.medicationId === medicationId)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function getAllActiveSchedules(): Promise<Schedule[]> {
  const meds = new Set(
    load<Medication>(KEYS.medications)
      .filter((m) => m.isActive)
      .map((m) => m.id)
  );
  return load<Schedule>(KEYS.schedules).filter(
    (s) => s.isActive && meds.has(s.medicationId)
  );
}

export async function getAllSchedules(): Promise<Schedule[]> {
  return load<Schedule>(KEYS.schedules).sort((a, b) => {
    const med = a.medicationId.localeCompare(b.medicationId);
    return med !== 0 ? med : a.time.localeCompare(b.time);
  });
}

export async function insertSchedule(schedule: Schedule): Promise<void> {
  const all = load<Schedule>(KEYS.schedules);
  all.push(schedule);
  save(KEYS.schedules, all);
}

export async function updateSchedule(schedule: Schedule): Promise<void> {
  const all = load<Schedule>(KEYS.schedules).map((s) =>
    s.id === schedule.id ? schedule : s
  );
  save(KEYS.schedules, all);
}

export async function deleteSchedule(id: string): Promise<void> {
  save(
    KEYS.schedules,
    load<Schedule>(KEYS.schedules).filter((s) => s.id !== id)
  );
  save(
    KEYS.doseLogs,
    load<DoseLog>(KEYS.doseLogs).filter((l) => l.scheduleId !== id)
  );
}

export async function deleteSchedulesByMedication(
  medicationId: string
): Promise<void> {
  const removed = load<Schedule>(KEYS.schedules).filter(
    (s) => s.medicationId === medicationId
  );
  save(
    KEYS.schedules,
    load<Schedule>(KEYS.schedules).filter(
      (s) => s.medicationId !== medicationId
    )
  );
  const ids = new Set(removed.map((s) => s.id));
  save(
    KEYS.doseLogs,
    load<DoseLog>(KEYS.doseLogs).filter((l) => !ids.has(l.scheduleId))
  );
}

// ─── Dose Logs ─────────────────────────────────────────────────────────────

export async function getAllDoseLogs(): Promise<DoseLog[]> {
  return load<DoseLog>(KEYS.doseLogs).sort((a, b) => {
    const d = b.scheduledDate.localeCompare(a.scheduledDate);
    return d !== 0 ? d : b.scheduledTime.localeCompare(a.scheduledTime);
  });
}

export async function getDoseLogsByDate(date: string): Promise<DoseLog[]> {
  return load<DoseLog>(KEYS.doseLogs)
    .filter((l) => l.scheduledDate === date)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

export async function getDoseLogsByDateRange(
  from: string,
  to: string
): Promise<DoseLog[]> {
  return load<DoseLog>(KEYS.doseLogs)
    .filter((l) => l.scheduledDate >= from && l.scheduledDate <= to)
    .sort((a, b) => {
      const d = b.scheduledDate.localeCompare(a.scheduledDate);
      return d !== 0 ? d : b.scheduledTime.localeCompare(a.scheduledTime);
    });
}

export async function getDoseLogByScheduleAndDate(
  scheduleId: string,
  date: string
): Promise<DoseLog | null> {
  return (
    load<DoseLog>(KEYS.doseLogs).find(
      (l) => l.scheduleId === scheduleId && l.scheduledDate === date
    ) ?? null
  );
}

export async function upsertDoseLog(log: DoseLog): Promise<void> {
  const all = load<DoseLog>(KEYS.doseLogs);
  const idx = all.findIndex(
    (l) => l.scheduleId === log.scheduleId && l.scheduledDate === log.scheduledDate
  );
  if (idx >= 0) {
    all[idx] = { ...all[idx], status: log.status, takenAt: log.takenAt };
  } else {
    all.push(log);
  }
  save(KEYS.doseLogs, all);
}

export async function updateDoseLogStatus(
  scheduleId: string,
  scheduledDate: string,
  status: DoseStatus,
  takenAt?: string
): Promise<void> {
  const all = load<DoseLog>(KEYS.doseLogs).map((l) =>
    l.scheduleId === scheduleId && l.scheduledDate === scheduledDate
      ? { ...l, status, takenAt: takenAt ?? l.takenAt }
      : l
  );
  save(KEYS.doseLogs, all);
}

// ─── Dev / Reset ───────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  save(KEYS.medications, []);
  save(KEYS.schedules, []);
  save(KEYS.doseLogs, []);
}
