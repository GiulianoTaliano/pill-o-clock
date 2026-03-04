import * as SQLite from "expo-sqlite";
import { Medication, Schedule, DoseLog, DoseStatus, DosageUnit, MedicationCategory } from "../types";

// ─── Open DB ───────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync("pilloclock.db");
  await _db.execAsync("PRAGMA foreign_keys = ON;");
  return _db;
}

// ─── Migrations ────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  const db = await getDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS medications (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      dosage        TEXT NOT NULL,
      dosage_amount REAL NOT NULL DEFAULT 1,
      dosage_unit   TEXT NOT NULL DEFAULT 'comprimidos',
      category      TEXT NOT NULL DEFAULT 'otro',
      notes         TEXT,
      color         TEXT NOT NULL DEFAULT 'blue',
      start_date    TEXT,
      end_date      TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id             TEXT PRIMARY KEY,
      medication_id  TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
      time           TEXT NOT NULL,
      days           TEXT NOT NULL DEFAULT '[]',
      is_active      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS dose_logs (
      id              TEXT PRIMARY KEY,
      medication_id   TEXT NOT NULL,
      schedule_id     TEXT NOT NULL,
      scheduled_date  TEXT NOT NULL,
      scheduled_time  TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      taken_at        TEXT,
      created_at      TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dose_unique
      ON dose_logs(schedule_id, scheduled_date);
  `);

  // ── Schema migrations ──────────────────────────────────────────────
  // v2: structured dosage (dosage_amount, dosage_unit) + category
  const [{ user_version }] = await db.getAllAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  if (user_version < 2) {
    // Each column is added inside its own try/catch: on a fresh install the
    // CREATE TABLE above already includes these columns, so ALTER TABLE would
    // throw "duplicate column name". On an older DB (v1) they don't exist yet
    // and the ALTER succeeds normally.
    const columns = [
      "ALTER TABLE medications ADD COLUMN dosage_amount REAL NOT NULL DEFAULT 1",
      "ALTER TABLE medications ADD COLUMN dosage_unit TEXT NOT NULL DEFAULT 'comprimidos'",
      "ALTER TABLE medications ADD COLUMN category TEXT NOT NULL DEFAULT 'otro'",
    ];
    for (const sql of columns) {
      try {
        await db.execAsync(sql);
      } catch {
        // Column already exists — safe to ignore.
      }
    }
    await db.execAsync("PRAGMA user_version = 2");
  }
}

// ─── Medications ───────────────────────────────────────────────────────────

function rowToMedication(row: Record<string, unknown>): Medication {
  const dosageAmount = (row.dosage_amount as number | undefined) ?? 1;
  const dosageUnit = ((row.dosage_unit as string | undefined) ?? "comprimidos") as DosageUnit;
  return {
    id: row.id as string,
    name: row.name as string,
    dosageAmount,
    dosageUnit,
    dosage: `${dosageAmount} ${dosageUnit}`,
    category: ((row.category as string | undefined) ?? "otro") as MedicationCategory,
    notes: row.notes as string | undefined,
    color: row.color as Medication["color"],
    startDate: row.start_date as string | undefined,
    endDate: row.end_date as string | undefined,
    isActive: (row.is_active as number) === 1,
    createdAt: row.created_at as string,
  };
}

export async function getMedications(): Promise<Medication[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM medications ORDER BY created_at DESC"
  );
  return rows.map(rowToMedication);
}

export async function getMedicationById(id: string): Promise<Medication | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM medications WHERE id = ?",
    [id]
  );
  return row ? rowToMedication(row) : null;
}

export async function insertMedication(med: Medication): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO medications
       (id, name, dosage, dosage_amount, dosage_unit, category, notes, color, start_date, end_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      med.id,
      med.name,
      med.dosage,
      med.dosageAmount,
      med.dosageUnit,
      med.category,
      med.notes ?? null,
      med.color,
      med.startDate ?? null,
      med.endDate ?? null,
      med.isActive ? 1 : 0,
      med.createdAt,
    ]
  );
}

export async function updateMedication(med: Medication): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE medications
     SET name = ?, dosage = ?, dosage_amount = ?, dosage_unit = ?, category = ?,
         notes = ?, color = ?, start_date = ?, end_date = ?, is_active = ?
     WHERE id = ?`,
    [
      med.name,
      med.dosage,
      med.dosageAmount,
      med.dosageUnit,
      med.category,
      med.notes ?? null,
      med.color,
      med.startDate ?? null,
      med.endDate ?? null,
      med.isActive ? 1 : 0,
      med.id,
    ]
  );
}

export async function deleteMedication(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM medications WHERE id = ?", [id]);
}

// ─── Schedules ─────────────────────────────────────────────────────────────

function rowToSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: row.id as string,
    medicationId: row.medication_id as string,
    time: row.time as string,
    days: JSON.parse(row.days as string),
    isActive: (row.is_active as number) === 1,
  };
}

export async function getSchedulesByMedication(medicationId: string): Promise<Schedule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM schedules WHERE medication_id = ? ORDER BY time",
    [medicationId]
  );
  return rows.map(rowToSchedule);
}

export async function getAllActiveSchedules(): Promise<Schedule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT s.* FROM schedules s
     JOIN medications m ON m.id = s.medication_id
     WHERE s.is_active = 1
       AND m.is_active = 1`
  );
  return rows.map(rowToSchedule);
}

export async function getAllSchedules(): Promise<Schedule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM schedules ORDER BY medication_id, time"
  );
  return rows.map(rowToSchedule);
}

export async function insertSchedule(schedule: Schedule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO schedules (id, medication_id, time, days, is_active) VALUES (?, ?, ?, ?, ?)",
    [
      schedule.id,
      schedule.medicationId,
      schedule.time,
      JSON.stringify(schedule.days),
      schedule.isActive ? 1 : 0,
    ]
  );
}

export async function updateSchedule(schedule: Schedule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE schedules SET time = ?, days = ?, is_active = ? WHERE id = ?",
    [
      schedule.time,
      JSON.stringify(schedule.days),
      schedule.isActive ? 1 : 0,
      schedule.id,
    ]
  );
}

export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM schedules WHERE id = ?", [id]);
}

export async function deleteSchedulesByMedication(medicationId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM schedules WHERE medication_id = ?", [medicationId]);
}

// ─── Dose Logs ─────────────────────────────────────────────────────────────

function rowToDoseLog(row: Record<string, unknown>): DoseLog {
  return {
    id: row.id as string,
    medicationId: row.medication_id as string,
    scheduleId: row.schedule_id as string,
    scheduledDate: row.scheduled_date as string,
    scheduledTime: row.scheduled_time as string,
    status: row.status as DoseStatus,
    takenAt: row.taken_at as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getAllDoseLogs(): Promise<DoseLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM dose_logs ORDER BY scheduled_date DESC, scheduled_time DESC"
  );
  return rows.map(rowToDoseLog);
}

export async function getDoseLogsByDate(date: string): Promise<DoseLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM dose_logs WHERE scheduled_date = ? ORDER BY scheduled_time",
    [date]
  );
  return rows.map(rowToDoseLog);
}

export async function getDoseLogsByDateRange(
  from: string,
  to: string
): Promise<DoseLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM dose_logs WHERE scheduled_date >= ? AND scheduled_date <= ? ORDER BY scheduled_date DESC, scheduled_time DESC",
    [from, to]
  );
  return rows.map(rowToDoseLog);
}

export async function getDoseLogByScheduleAndDate(
  scheduleId: string,
  date: string
): Promise<DoseLog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM dose_logs WHERE schedule_id = ? AND scheduled_date = ?",
    [scheduleId, date]
  );
  return row ? rowToDoseLog(row) : null;
}

export async function upsertDoseLog(log: DoseLog): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO dose_logs (id, medication_id, schedule_id, scheduled_date, scheduled_time, status, taken_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(schedule_id, scheduled_date) DO UPDATE SET
       status = excluded.status,
       taken_at = excluded.taken_at`,
    [
      log.id,
      log.medicationId,
      log.scheduleId,
      log.scheduledDate,
      log.scheduledTime,
      log.status,
      log.takenAt ?? null,
      log.createdAt,
    ]
  );
}

export async function updateDoseLogStatus(
  scheduleId: string,
  scheduledDate: string,
  status: DoseStatus,
  takenAt?: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE dose_logs SET status = ?, taken_at = ?
     WHERE schedule_id = ? AND scheduled_date = ?`,
    [status, takenAt ?? null, scheduleId, scheduledDate]
  );
}

// ─── Dev / Reset ───────────────────────────────────────────────────────────

/** Deletes all rows from every table. Schema (tables) is preserved. */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM dose_logs;
    DELETE FROM schedules;
    DELETE FROM medications;
  `);
}
