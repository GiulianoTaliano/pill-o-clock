import * as SQLite from "expo-sqlite";
import { Medication, Schedule, DoseLog, DoseStatus, DosageUnit, MedicationCategory, Appointment, HealthMeasurement, MeasurementType, DailyCheckin, SkipReason } from "../types";

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
      created_at    TEXT NOT NULL,
      stock_quantity INTEGER,
      stock_alert_threshold INTEGER,
      photo_uri     TEXT,
      is_prn        INTEGER NOT NULL DEFAULT 0
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
      created_at      TEXT NOT NULL,
      notes           TEXT,
      skip_reason     TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dose_unique
      ON dose_logs(schedule_id, scheduled_date);

    CREATE TABLE IF NOT EXISTS appointments (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      doctor            TEXT,
      location          TEXT,
      notes             TEXT,
      date              TEXT NOT NULL,
      time              TEXT,
      reminder_minutes  INTEGER,
      notification_id   TEXT,
      created_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_measurements (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      value1       REAL NOT NULL,
      value2       REAL,
      measured_at  TEXT NOT NULL,
      notes        TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL UNIQUE,
      mood        INTEGER NOT NULL,
      symptoms    TEXT NOT NULL DEFAULT '[]',
      notes       TEXT,
      created_at  TEXT NOT NULL
    );
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

  if (user_version < 3) {
    for (const sql of [
      "ALTER TABLE medications ADD COLUMN stock_quantity INTEGER",
      "ALTER TABLE medications ADD COLUMN stock_alert_threshold INTEGER",
    ]) {
      try { await db.execAsync(sql); } catch { /* already exists */ }
    }
    await db.execAsync("PRAGMA user_version = 3");
  }

  if (user_version < 4) {
    try { await db.execAsync("ALTER TABLE dose_logs ADD COLUMN notes TEXT"); } catch { /* already exists */ }
    await db.execAsync("PRAGMA user_version = 4");
  }

  if (user_version < 5) {
    for (const sql of [
      "ALTER TABLE appointments ADD COLUMN location_lat REAL",
      "ALTER TABLE appointments ADD COLUMN location_lng REAL",
    ]) {
      try { await db.execAsync(sql); } catch { /* already exists */ }
    }
    await db.execAsync("PRAGMA user_version = 5");
  }

  if (user_version < 6) {
    try { await db.execAsync("ALTER TABLE dose_logs ADD COLUMN skip_reason TEXT"); } catch { /* already exists */ }
    await db.execAsync("PRAGMA user_version = 6");
  }

  if (user_version < 7) {
    for (const sql of [
      "ALTER TABLE medications ADD COLUMN photo_uri TEXT",
      "ALTER TABLE medications ADD COLUMN is_prn INTEGER NOT NULL DEFAULT 0",
    ]) {
      try { await db.execAsync(sql); } catch { /* already exists */ }
    }
    await db.execAsync("PRAGMA user_version = 7");
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
    stockQuantity: row.stock_quantity != null ? (row.stock_quantity as number) : undefined,
    stockAlertThreshold: row.stock_alert_threshold != null ? (row.stock_alert_threshold as number) : undefined,
    photoUri: row.photo_uri as string | undefined,
    isPRN: (row.is_prn as number) === 1,
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
       (id, name, dosage, dosage_amount, dosage_unit, category, notes, color, start_date, end_date, is_active, created_at, stock_quantity, stock_alert_threshold, photo_uri, is_prn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      med.stockQuantity ?? null,
      med.stockAlertThreshold ?? null,
      med.photoUri ?? null,
      med.isPRN ? 1 : 0,
    ]
  );
}

export async function updateMedication(med: Medication): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE medications
     SET name = ?, dosage = ?, dosage_amount = ?, dosage_unit = ?, category = ?,
         notes = ?, color = ?, start_date = ?, end_date = ?, is_active = ?,
         stock_quantity = ?, stock_alert_threshold = ?, photo_uri = ?, is_prn = ?
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
      med.stockQuantity ?? null,
      med.stockAlertThreshold ?? null,
      med.photoUri ?? null,
      med.isPRN ? 1 : 0,
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
    notes: row.notes as string | undefined,
    skipReason: row.skip_reason as SkipReason | undefined,
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
  // DELETE + INSERT ensures exactly one row per (schedule_id, scheduled_date)
  // without relying on the unique index being present on every device DB.
  await db.runAsync(
    `DELETE FROM dose_logs WHERE schedule_id = ? AND scheduled_date = ?`,
    [log.scheduleId, log.scheduledDate]
  );
  await db.runAsync(
    `INSERT INTO dose_logs (id, medication_id, schedule_id, scheduled_date, scheduled_time, status, taken_at, created_at, notes, skip_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.id,
      log.medicationId,
      log.scheduleId,
      log.scheduledDate,
      log.scheduledTime,
      log.status,
      log.takenAt ?? null,
      log.createdAt,
      log.notes ?? null,
      log.skipReason ?? null,
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

export async function deleteDoseLog(
  scheduleId: string,
  scheduledDate: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "DELETE FROM dose_logs WHERE schedule_id = ? AND scheduled_date = ?",
    [scheduleId, scheduledDate]
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
    DELETE FROM appointments;
    DELETE FROM health_measurements;
    DELETE FROM daily_checkins;
  `);
}

// ─── Appointments ─────────────────────────────────────────────────────────

function rowToAppointment(row: Record<string, unknown>): Appointment {
  const lat = row.location_lat != null ? (row.location_lat as number) : undefined;
  const lng = row.location_lng != null ? (row.location_lng as number) : undefined;
  return {
    id: row.id as string,
    title: row.title as string,
    doctor: row.doctor as string | undefined,
    location: row.location as string | undefined,
    locationCoords:
      lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined,
    notes: row.notes as string | undefined,
    date: row.date as string,
    time: row.time as string | undefined,
    reminderMinutes: row.reminder_minutes != null ? (row.reminder_minutes as number) : undefined,
    notificationId: row.notification_id as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getAppointments(): Promise<Appointment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM appointments ORDER BY date ASC, time ASC"
  );
  return rows.map(rowToAppointment);
}

export async function insertAppointment(appt: Appointment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO appointments (id, title, doctor, location, location_lat, location_lng, notes, date, time, reminder_minutes, notification_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      appt.id,
      appt.title,
      appt.doctor ?? null,
      appt.location ?? null,
      appt.locationCoords?.latitude ?? null,
      appt.locationCoords?.longitude ?? null,
      appt.notes ?? null,
      appt.date,
      appt.time ?? null,
      appt.reminderMinutes ?? null,
      appt.notificationId ?? null,
      appt.createdAt,
    ]
  );
}

export async function updateAppointment(appt: Appointment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE appointments
     SET title = ?, doctor = ?, location = ?, location_lat = ?, location_lng = ?,
         notes = ?, date = ?, time = ?, reminder_minutes = ?, notification_id = ?
     WHERE id = ?`,
    [
      appt.title,
      appt.doctor ?? null,
      appt.location ?? null,
      appt.locationCoords?.latitude ?? null,
      appt.locationCoords?.longitude ?? null,
      appt.notes ?? null,
      appt.date,
      appt.time ?? null,
      appt.reminderMinutes ?? null,
      appt.notificationId ?? null,
      appt.id,
    ]
  );
}

export async function deleteAppointment(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM appointments WHERE id = ?", [id]);
}

export async function updateMedicationStock(id: string, newQuantity: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE medications SET stock_quantity = ? WHERE id = ?", [newQuantity, id]);
}

export async function updateDoseLogNotes(
  scheduleId: string,
  scheduledDate: string,
  notes: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE dose_logs SET notes = ? WHERE schedule_id = ? AND scheduled_date = ?",
    [notes, scheduleId, scheduledDate]
  );
}

// ─── Health measurements ─────────────────────────────────────────────────────

function rowToHealthMeasurement(row: Record<string, unknown>): HealthMeasurement {
  return {
    id: row.id as string,
    type: row.type as MeasurementType,
    value1: row.value1 as number,
    value2: row.value2 != null ? (row.value2 as number) : undefined,
    measuredAt: row.measured_at as string,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getHealthMeasurements(
  type?: MeasurementType,
  limit = 60
): Promise<HealthMeasurement[]> {
  const db = await getDb();
  const rows = type
    ? await db.getAllAsync<Record<string, unknown>>(
        "SELECT * FROM health_measurements WHERE type = ? ORDER BY measured_at DESC LIMIT ?",
        [type, limit]
      )
    : await db.getAllAsync<Record<string, unknown>>(
        "SELECT * FROM health_measurements ORDER BY measured_at DESC LIMIT ?",
        [limit]
      );
  return rows.map(rowToHealthMeasurement);
}

export async function insertHealthMeasurement(m: HealthMeasurement): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO health_measurements (id, type, value1, value2, measured_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [m.id, m.type, m.value1, m.value2 ?? null, m.measuredAt, m.notes ?? null, m.createdAt]
  );
}

export async function deleteHealthMeasurement(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM health_measurements WHERE id = ?", [id]);
}

// ─── Daily check-ins ─────────────────────────────────────────────────────────

function rowToDailyCheckin(row: Record<string, unknown>): DailyCheckin {
  return {
    id: row.id as string,
    date: row.date as string,
    mood: row.mood as 1 | 2 | 3 | 4 | 5,
    symptoms: JSON.parse((row.symptoms as string | undefined) ?? '[]') as string[],
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getDailyCheckins(
  fromDate?: string,
  toDate?: string
): Promise<DailyCheckin[]> {
  const db = await getDb();
  if (fromDate && toDate) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM daily_checkins WHERE date >= ? AND date <= ? ORDER BY date DESC",
      [fromDate, toDate]
    );
    return rows.map(rowToDailyCheckin);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM daily_checkins ORDER BY date DESC LIMIT 90"
  );
  return rows.map(rowToDailyCheckin);
}

export async function getDailyCheckinByDate(date: string): Promise<DailyCheckin | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM daily_checkins WHERE date = ?",
    [date]
  );
  return row ? rowToDailyCheckin(row) : null;
}

export async function upsertDailyCheckin(checkin: DailyCheckin): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO daily_checkins (id, date, mood, symptoms, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       mood = excluded.mood,
       symptoms = excluded.symptoms,
       notes = excluded.notes`,
    [
      checkin.id,
      checkin.date,
      checkin.mood,
      JSON.stringify(checkin.symptoms),
      checkin.notes ?? null,
      checkin.createdAt,
    ]
  );
}
