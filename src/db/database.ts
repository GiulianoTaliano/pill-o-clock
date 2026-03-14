import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import * as schema from "./schema";
import type {
  Medication,
  Schedule,
  DoseLog,
  DoseStatus,
  DosageUnit,
  MedicationCategory,
  Appointment,
  HealthMeasurement,
  MeasurementType,
  DailyCheckin,
  SkipReason,
} from "../types";

// ─── Open DB ───────────────────────────────────────────────────────────────

const expoDb = SQLite.openDatabaseSync("pilloclock.db");
expoDb.execSync("PRAGMA journal_mode=WAL;");
expoDb.execSync("PRAGMA foreign_keys = ON;");

export const db = drizzle(expoDb, { schema });

/** Keep for low-level access (e.g. raw PRAGMA, execSync). */
export function getDb(): SQLite.SQLiteDatabase {
  return expoDb;
}

// ─── Row → Domain helpers ──────────────────────────────────────────────────

function toMedication(row: typeof schema.medications.$inferSelect): Medication {
  return {
    id: row.id,
    name: row.name,
    dosageAmount: row.dosageAmount,
    dosageUnit: row.dosageUnit as DosageUnit,
    dosage: row.dosage,
    category: row.category as MedicationCategory,
    notes: row.notes ?? undefined,
    color: row.color,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt,
    stockQuantity: row.stockQuantity ?? undefined,
    stockAlertThreshold: row.stockAlertThreshold ?? undefined,
    photoUri: row.photoUri ?? undefined,
    isPRN: row.isPRN,
  };
}

function toSchedule(row: typeof schema.schedules.$inferSelect): Schedule {
  let days: number[] = [];
  try {
    days = JSON.parse(row.days) as number[];
  } catch {
    // Malformed JSON — treat as daily schedule (empty = every day)
    days = [];
  }
  return {
    id: row.id,
    medicationId: row.medicationId,
    time: row.time,
    days,
    isActive: row.isActive,
  };
}

function toDoseLog(row: typeof schema.doseLogs.$inferSelect): DoseLog {
  return {
    id: row.id,
    medicationId: row.medicationId,
    scheduleId: row.scheduleId,
    scheduledDate: row.scheduledDate,
    scheduledTime: row.scheduledTime,
    status: row.status as DoseStatus,
    takenAt: row.takenAt ?? undefined,
    createdAt: row.createdAt,
    notes: row.notes ?? undefined,
    skipReason: (row.skipReason as SkipReason) ?? undefined,
  };
}

function toAppointment(row: typeof schema.appointments.$inferSelect): Appointment {
  return {
    id: row.id,
    title: row.title,
    doctor: row.doctor ?? undefined,
    location: row.location ?? undefined,
    locationCoords:
      row.locationLat != null && row.locationLng != null
        ? { latitude: row.locationLat, longitude: row.locationLng }
        : undefined,
    notes: row.notes ?? undefined,
    date: row.date,
    time: row.time ?? undefined,
    reminderMinutes: row.reminderMinutes ?? undefined,
    notificationId: row.notificationId ?? undefined,
    createdAt: row.createdAt,
  };
}

function toHealthMeasurement(row: typeof schema.healthMeasurements.$inferSelect): HealthMeasurement {
  return {
    id: row.id,
    type: row.type as MeasurementType,
    value1: row.value1,
    value2: row.value2 ?? undefined,
    measuredAt: row.measuredAt,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
  };
}

function toDailyCheckin(row: typeof schema.dailyCheckins.$inferSelect): DailyCheckin {
  let symptoms: string[] = [];
  try {
    symptoms = JSON.parse(row.symptoms) as string[];
  } catch {
    // Malformed JSON — default to no symptoms
    symptoms = [];
  }
  return {
    id: row.id,
    date: row.date,
    mood: row.mood as 1 | 2 | 3 | 4 | 5,
    symptoms,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
  };
}

// ─── Migrations (legacy PRAGMA user_version) ──────────────────────────────

export async function initDatabase(): Promise<void> {
  expoDb.execSync(`
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

  const [{ user_version }] = expoDb.getAllSync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  if (user_version < 2) {
    // Each column is added inside its own try/catch: on a fresh install the
    // CREATE TABLE above already includes these columns, so ALTER TABLE would
    // throw "duplicate column name". On an older DB (v1) they don't exist yet
    // and the ALTER succeeds normally.
    for (const s of [
      "ALTER TABLE medications ADD COLUMN dosage_amount REAL NOT NULL DEFAULT 1",
      "ALTER TABLE medications ADD COLUMN dosage_unit TEXT NOT NULL DEFAULT 'comprimidos'",
      "ALTER TABLE medications ADD COLUMN category TEXT NOT NULL DEFAULT 'otro'",
    ]) {
      try { expoDb.execSync(s); } catch { /* already exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 2");
  }

  if (user_version < 3) {
    for (const s of [
      "ALTER TABLE medications ADD COLUMN stock_quantity INTEGER",
      "ALTER TABLE medications ADD COLUMN stock_alert_threshold INTEGER",
    ]) {
      try { expoDb.execSync(s); } catch { /* already exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 3");
  }

  if (user_version < 4) {
    try { expoDb.execSync("ALTER TABLE dose_logs ADD COLUMN notes TEXT"); } catch { /* exists */ }
    expoDb.execSync("PRAGMA user_version = 4");
  }

  if (user_version < 5) {
    for (const s of [
      "ALTER TABLE appointments ADD COLUMN location_lat REAL",
      "ALTER TABLE appointments ADD COLUMN location_lng REAL",
    ]) {
      try { expoDb.execSync(s); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 5");
  }

  if (user_version < 6) {
    try { expoDb.execSync("ALTER TABLE dose_logs ADD COLUMN skip_reason TEXT"); } catch { /* exists */ }
    expoDb.execSync("PRAGMA user_version = 6");
  }

  if (user_version < 7) {
    for (const s of [
      "ALTER TABLE medications ADD COLUMN photo_uri TEXT",
      "ALTER TABLE medications ADD COLUMN is_prn INTEGER NOT NULL DEFAULT 0",
    ]) {
      try { expoDb.execSync(s); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 7");
  }

  if (user_version < 8) {
    // Move notification map from AsyncStorage to SQLite (A3).
    // The old AsyncStorage key (@pilloclock/notif_map) is left in place and
    // migrated on first call to setupNotifications() in notifications.ts.
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS notification_map (
        notif_id        TEXT PRIMARY KEY,
        schedule_id     TEXT NOT NULL,
        scheduled_date  TEXT NOT NULL,
        scheduled_time  TEXT NOT NULL,
        medication_id   TEXT NOT NULL,
        dose_log_id     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notif_map_dose
        ON notification_map(schedule_id, scheduled_date);
    `);
    expoDb.execSync("PRAGMA user_version = 8");
  }

  if (user_version < 9) {
    expoDb.execSync(`
      CREATE INDEX IF NOT EXISTS idx_dose_logs_medication_id
        ON dose_logs(medication_id);

      CREATE INDEX IF NOT EXISTS idx_dose_logs_scheduled_date
        ON dose_logs(scheduled_date);

      CREATE INDEX IF NOT EXISTS idx_health_measurements_type_date
        ON health_measurements(type, measured_at DESC);

      CREATE INDEX IF NOT EXISTS idx_schedules_medication_id
        ON schedules(medication_id);
    `);
    expoDb.execSync("PRAGMA user_version = 9");
  }
}

// ─── Medications ───────────────────────────────────────────────────────────

export async function getMedications(): Promise<Medication[]> {
  const rows = db.select().from(schema.medications).orderBy(desc(schema.medications.createdAt)).all();
  return rows.map(toMedication);
}

export async function getMedicationById(id: string): Promise<Medication | null> {
  const row = db.select().from(schema.medications).where(eq(schema.medications.id, id)).get();
  return row ? toMedication(row) : null;
}

export async function insertMedication(med: Medication): Promise<void> {
  db.insert(schema.medications).values({
    id: med.id,
    name: med.name,
    dosage: med.dosage,
    dosageAmount: med.dosageAmount,
    dosageUnit: med.dosageUnit,
    category: med.category,
    notes: med.notes ?? null,
    color: med.color,
    startDate: med.startDate ?? null,
    endDate: med.endDate ?? null,
    isActive: med.isActive,
    createdAt: med.createdAt,
    stockQuantity: med.stockQuantity ?? null,
    stockAlertThreshold: med.stockAlertThreshold ?? null,
    photoUri: med.photoUri ?? null,
    isPRN: med.isPRN ?? false,
  }).run();
}

export async function updateMedication(med: Medication): Promise<void> {
  db.update(schema.medications).set({
    name: med.name,
    dosage: med.dosage,
    dosageAmount: med.dosageAmount,
    dosageUnit: med.dosageUnit,
    category: med.category,
    notes: med.notes ?? null,
    color: med.color,
    startDate: med.startDate ?? null,
    endDate: med.endDate ?? null,
    isActive: med.isActive,
    stockQuantity: med.stockQuantity ?? null,
    stockAlertThreshold: med.stockAlertThreshold ?? null,
    photoUri: med.photoUri ?? null,
    isPRN: med.isPRN ?? false,
  }).where(eq(schema.medications.id, med.id)).run();
}

export async function deleteMedication(id: string): Promise<void> {
  db.delete(schema.medications).where(eq(schema.medications.id, id)).run();
}

// ─── Schedules ─────────────────────────────────────────────────────────────

export async function getSchedulesByMedication(medicationId: string): Promise<Schedule[]> {
  const rows = db.select().from(schema.schedules)
    .where(eq(schema.schedules.medicationId, medicationId))
    .orderBy(asc(schema.schedules.time))
    .all();
  return rows.map(toSchedule);
}

export async function getAllActiveSchedules(): Promise<Schedule[]> {
  const rows = db.select({ schedule: schema.schedules })
    .from(schema.schedules)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.schedules.medicationId))
    .where(and(eq(schema.schedules.isActive, true), eq(schema.medications.isActive, true)))
    .all();
  return rows.map((r) => toSchedule(r.schedule));
}

export async function getAllSchedules(): Promise<Schedule[]> {
  const rows = db.select().from(schema.schedules)
    .orderBy(asc(schema.schedules.medicationId), asc(schema.schedules.time))
    .all();
  return rows.map(toSchedule);
}

export async function insertSchedule(schedule: Schedule): Promise<void> {
  db.insert(schema.schedules).values({
    id: schedule.id,
    medicationId: schedule.medicationId,
    time: schedule.time,
    days: JSON.stringify(schedule.days),
    isActive: schedule.isActive,
  }).run();
}

export async function updateSchedule(schedule: Schedule): Promise<void> {
  db.update(schema.schedules).set({
    time: schedule.time,
    days: JSON.stringify(schedule.days),
    isActive: schedule.isActive,
  }).where(eq(schema.schedules.id, schedule.id)).run();
}

export async function deleteSchedule(id: string): Promise<void> {
  db.delete(schema.schedules).where(eq(schema.schedules.id, id)).run();
}

export async function deleteSchedulesByMedication(medicationId: string): Promise<void> {
  db.delete(schema.schedules).where(eq(schema.schedules.medicationId, medicationId)).run();
}

// ─── Dose Logs ─────────────────────────────────────────────────────────────

export async function getAllDoseLogs(): Promise<DoseLog[]> {
  const rows = db.select().from(schema.doseLogs)
    .orderBy(desc(schema.doseLogs.scheduledDate), desc(schema.doseLogs.scheduledTime))
    .all();
  return rows.map(toDoseLog);
}

export async function getDoseLogsByDate(date: string): Promise<DoseLog[]> {
  const rows = db.select().from(schema.doseLogs)
    .where(eq(schema.doseLogs.scheduledDate, date))
    .orderBy(asc(schema.doseLogs.scheduledTime))
    .all();
  return rows.map(toDoseLog);
}

export async function getDoseLogsByDateRange(from: string, to: string): Promise<DoseLog[]> {
  const rows = db.select().from(schema.doseLogs)
    .where(and(gte(schema.doseLogs.scheduledDate, from), lte(schema.doseLogs.scheduledDate, to)))
    .orderBy(desc(schema.doseLogs.scheduledDate), desc(schema.doseLogs.scheduledTime))
    .all();
  return rows.map(toDoseLog);
}

export async function getDoseLogByScheduleAndDate(
  scheduleId: string,
  date: string
): Promise<DoseLog | null> {
  const row = db.select().from(schema.doseLogs)
    .where(and(eq(schema.doseLogs.scheduleId, scheduleId), eq(schema.doseLogs.scheduledDate, date)))
    .get();
  return row ? toDoseLog(row) : null;
}

export async function upsertDoseLog(log: DoseLog): Promise<void> {
  // Wrapped in a transaction so that if the app crashes between the DELETE
  // and INSERT, the dose log is never left in a partially-written state.
  db.transaction((tx) => {
    tx.delete(schema.doseLogs).where(
      and(eq(schema.doseLogs.scheduleId, log.scheduleId), eq(schema.doseLogs.scheduledDate, log.scheduledDate))
    ).run();
    tx.insert(schema.doseLogs).values({
      id: log.id,
      medicationId: log.medicationId,
      scheduleId: log.scheduleId,
      scheduledDate: log.scheduledDate,
      scheduledTime: log.scheduledTime,
      status: log.status,
      takenAt: log.takenAt ?? null,
      createdAt: log.createdAt,
      notes: log.notes ?? null,
      skipReason: log.skipReason ?? null,
    }).run();
  });
}

/**
 * Inserts a "missed" dose log only when no log already exists for
 * (scheduleId, scheduledDate). Uses INSERT OR IGNORE so it never overwrites
 * an existing "taken" or "skipped" log — safe to call from the background
 * task without race-condition risk.
 */
export async function insertMissedDoseLogSafe(log: DoseLog): Promise<void> {
  expoDb.runSync(
    `INSERT OR IGNORE INTO dose_logs
       (id, medication_id, schedule_id, scheduled_date, scheduled_time,
        status, taken_at, created_at, notes, skip_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.id, log.medicationId, log.scheduleId, log.scheduledDate,
      log.scheduledTime, log.status, log.takenAt ?? null, log.createdAt,
      log.notes ?? null, log.skipReason ?? null,
    ]
  );
}

export async function updateDoseLogStatus(
  scheduleId: string,
  scheduledDate: string,
  status: DoseStatus,
  takenAt?: string
): Promise<void> {
  db.update(schema.doseLogs).set({
    status,
    takenAt: takenAt ?? null,
  }).where(
    and(eq(schema.doseLogs.scheduleId, scheduleId), eq(schema.doseLogs.scheduledDate, scheduledDate))
  ).run();
}

export async function deleteDoseLog(scheduleId: string, scheduledDate: string): Promise<void> {
  db.delete(schema.doseLogs).where(
    and(eq(schema.doseLogs.scheduleId, scheduleId), eq(schema.doseLogs.scheduledDate, scheduledDate))
  ).run();
}

// ─── Dev / Reset ───────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  db.delete(schema.doseLogs).run();
  db.delete(schema.schedules).run();
  db.delete(schema.medications).run();
  db.delete(schema.appointments).run();
  db.delete(schema.healthMeasurements).run();
  db.delete(schema.dailyCheckins).run();
}

// ─── Appointments ──────────────────────────────────────────────────────────

export async function getAppointments(): Promise<Appointment[]> {
  const rows = db.select().from(schema.appointments)
    .orderBy(asc(schema.appointments.date), asc(schema.appointments.time))
    .all();
  return rows.map(toAppointment);
}

export async function insertAppointment(appt: Appointment): Promise<void> {
  db.insert(schema.appointments).values({
    id: appt.id,
    title: appt.title,
    doctor: appt.doctor ?? null,
    location: appt.location ?? null,
    locationLat: appt.locationCoords?.latitude ?? null,
    locationLng: appt.locationCoords?.longitude ?? null,
    notes: appt.notes ?? null,
    date: appt.date,
    time: appt.time ?? null,
    reminderMinutes: appt.reminderMinutes ?? null,
    notificationId: appt.notificationId ?? null,
    createdAt: appt.createdAt,
  }).run();
}

export async function updateAppointment(appt: Appointment): Promise<void> {
  db.update(schema.appointments).set({
    title: appt.title,
    doctor: appt.doctor ?? null,
    location: appt.location ?? null,
    locationLat: appt.locationCoords?.latitude ?? null,
    locationLng: appt.locationCoords?.longitude ?? null,
    notes: appt.notes ?? null,
    date: appt.date,
    time: appt.time ?? null,
    reminderMinutes: appt.reminderMinutes ?? null,
    notificationId: appt.notificationId ?? null,
  }).where(eq(schema.appointments.id, appt.id)).run();
}

export async function deleteAppointment(id: string): Promise<void> {
  db.delete(schema.appointments).where(eq(schema.appointments.id, id)).run();
}

export async function updateMedicationStock(id: string, newQuantity: number): Promise<void> {
  db.update(schema.medications).set({ stockQuantity: newQuantity })
    .where(eq(schema.medications.id, id)).run();
}

export async function updateDoseLogNotes(
  scheduleId: string,
  scheduledDate: string,
  notes: string
): Promise<void> {
  db.update(schema.doseLogs).set({ notes })
    .where(and(eq(schema.doseLogs.scheduleId, scheduleId), eq(schema.doseLogs.scheduledDate, scheduledDate)))
    .run();
}

// ─── Health measurements ───────────────────────────────────────────────────

export async function getHealthMeasurements(
  type?: MeasurementType,
  limit = 60
): Promise<HealthMeasurement[]> {
  const q = db.select().from(schema.healthMeasurements);
  const rows = type
    ? q.where(eq(schema.healthMeasurements.type, type))
        .orderBy(desc(schema.healthMeasurements.measuredAt))
        .limit(limit).all()
    : q.orderBy(desc(schema.healthMeasurements.measuredAt))
        .limit(limit).all();
  return rows.map(toHealthMeasurement);
}

export async function insertHealthMeasurement(m: HealthMeasurement): Promise<void> {
  db.insert(schema.healthMeasurements).values({
    id: m.id,
    type: m.type,
    value1: m.value1,
    value2: m.value2 ?? null,
    measuredAt: m.measuredAt,
    notes: m.notes ?? null,
    createdAt: m.createdAt,
  }).run();
}

export async function deleteHealthMeasurement(id: string): Promise<void> {
  db.delete(schema.healthMeasurements).where(eq(schema.healthMeasurements.id, id)).run();
}

// ─── Daily check-ins ───────────────────────────────────────────────────────

export async function getDailyCheckins(
  fromDate?: string,
  toDate?: string
): Promise<DailyCheckin[]> {
  if (fromDate && toDate) {
    const rows = db.select().from(schema.dailyCheckins)
      .where(and(gte(schema.dailyCheckins.date, fromDate), lte(schema.dailyCheckins.date, toDate)))
      .orderBy(desc(schema.dailyCheckins.date))
      .all();
    return rows.map(toDailyCheckin);
  }
  const rows = db.select().from(schema.dailyCheckins)
    .orderBy(desc(schema.dailyCheckins.date))
    .limit(90)
    .all();
  return rows.map(toDailyCheckin);
}

export async function getDailyCheckinByDate(date: string): Promise<DailyCheckin | null> {
  const row = db.select().from(schema.dailyCheckins)
    .where(eq(schema.dailyCheckins.date, date))
    .get();
  return row ? toDailyCheckin(row) : null;
}

export async function upsertDailyCheckin(checkin: DailyCheckin): Promise<void> {
  db.insert(schema.dailyCheckins).values({
    id: checkin.id,
    date: checkin.date,
    mood: checkin.mood,
    symptoms: JSON.stringify(checkin.symptoms),
    notes: checkin.notes ?? null,
    createdAt: checkin.createdAt,
  }).onConflictDoUpdate({
    target: schema.dailyCheckins.date,
    set: {
      mood: checkin.mood,
      symptoms: JSON.stringify(checkin.symptoms),
      notes: checkin.notes ?? null,
    },
  }).run();
}
