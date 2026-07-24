import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { eq, ne, and, gte, lte, desc, asc } from "drizzle-orm";
import * as schema from "./schema";
import { getActiveProfileId, DEFAULT_PROFILE_ID } from "../services/profileStore";
import type {
  Medication,
  Schedule,
  DoseLog,
  DoseStatus,
  DosageUnit,
  MedicationCategory,
  Appointment,
  AppointmentDocument,
  HealthMeasurement,
  MeasurementType,
  DailyCheckin,
  SkipReason,
  Profile,
  Allergy,
} from "../types";

// ─── Open DB (encrypted at rest via SQLCipher, F1) ─────────────────────────
//
// expo-sqlite is compiled with SQLCipher (app.json plugin `useSQLCipher` +
// android/gradle.properties `expo.sqlite.useSQLCipher=true`). The 32-byte raw
// key lives in expo-secure-store (Android Keystore / iOS Keychain) and is read
// SYNCHRONOUSLY so the PRAGMA key can be the first statement on the
// connection — required both for cold starts and headless (background-task)
// entries that never run _layout's async init.
//
// SAFETY CONTRACT: any failure — SecureStore unavailable, migration error,
// corrupted encrypted copy — falls back to the plaintext database and reports
// to Sentry. A medication-safety app must never brick or lose data over
// encryption; the fallback keeps the previous behaviour.

const DB_NAME = "pilloclock.db";
const DB_KEY_STORE_KEY = "pilloclock.db_key";

function getOrCreateDbKey(): string | null {
  try {
    let key = SecureStore.getItem(DB_KEY_STORE_KEY);
    if (!key) {
      const bytes = Crypto.getRandomBytes(32);
      key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      SecureStore.setItem(DB_KEY_STORE_KEY, key);
    }
    return key;
  } catch {
    return null; // e.g. Expo Go / no Keystore → plaintext fallback
  }
}

/** SQLCipher raw-key PRAGMA — must be the first statement on a connection. */
function applyDbKey(handle: SQLite.SQLiteDatabase, key: string): void {
  handle.execSync(`PRAGMA key = "x'${key}'";`);
}

function sqliteDirPaths(): { uri: string; plain: string } {
  const dir = String(SQLite.defaultDatabaseDirectory);
  const plain = dir.replace(/^file:\/\//, "");
  const uri = dir.startsWith("file://") ? dir : `file://${dir}`;
  return { uri, plain };
}

function openSecureDatabase(): SQLite.SQLiteDatabase {
  const key = getOrCreateDbKey();
  if (!key) return SQLite.openDatabaseSync(DB_NAME);

  // Fast path: already-encrypted (or brand-new) database.
  let handle = SQLite.openDatabaseSync(DB_NAME);
  try {
    applyDbKey(handle, key);
    handle.getFirstSync("PRAGMA user_version;");
    return handle;
  } catch {
    try { handle.closeSync(); } catch { /* already closed */ }
  }

  // Legacy plaintext database → one-time migration via sqlcipher_export.
  try {
    const { uri, plain } = sqliteDirPaths();
    const ENC_NAME = "pilloclock-enc.db";
    const encFile = new File(uri, ENC_NAME);
    if (encFile.exists) encFile.delete(); // stale partial migration

    const plainDb = SQLite.openDatabaseSync(DB_NAME);
    const ver =
      plainDb.getFirstSync<{ user_version: number }>("PRAGMA user_version;")
        ?.user_version ?? 0;
    plainDb.execSync(
      `ATTACH DATABASE '${plain}/${ENC_NAME}' AS enc KEY "x'${key}'";`
    );
    plainDb.execSync("SELECT sqlcipher_export('enc');");
    plainDb.execSync(`PRAGMA enc.user_version = ${ver};`);
    plainDb.execSync("DETACH DATABASE enc;");
    plainDb.closeSync();

    // Verify the encrypted copy is readable BEFORE touching the original.
    const check = SQLite.openDatabaseSync(ENC_NAME);
    applyDbKey(check, key);
    check.getFirstSync("SELECT count(*) AS c FROM sqlite_master;");
    check.closeSync();

    // Swap: remove the plaintext db (+ WAL/SHM leftovers), rename encrypted.
    new File(uri, DB_NAME).delete();
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const leftover = new File(uri, DB_NAME + suffix);
      if (leftover.exists) leftover.delete();
    }
    encFile.move(new File(uri, DB_NAME));

    const enc = SQLite.openDatabaseSync(DB_NAME);
    applyDbKey(enc, key);
    enc.getFirstSync("PRAGMA user_version;");
    console.log("[db] plaintext database migrated to SQLCipher");
    return enc;
  } catch (e) {
    console.warn("[db] encryption migration failed — using plaintext DB", e);
    try {
      // Deferred import keeps Sentry optional in test environments.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@sentry/react-native").captureException(e, {
        tags: { task: "sqlcipherMigration" },
      });
    } catch { /* sentry unavailable */ }
    return SQLite.openDatabaseSync(DB_NAME);
  }
}

const expoDb = openSecureDatabase();
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
    renewalDate: row.renewalDate ?? undefined,
    renewalNotifIds: row.renewalNotifIds ?? undefined,
    prnMaxPerDay: row.prnMaxPerDay ?? undefined,
    prnMinIntervalMinutes: row.prnMinIntervalMinutes ?? undefined,
    rxcui: row.rxcui ?? undefined,
    profileId: row.profileId,
    regimen: row.regimen ?? undefined,
    isInjectable: row.isInjectable,
    archivedAt: row.archivedAt ?? undefined,
    archiveReason: row.archiveReason ?? undefined,
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
    injectionSite: row.injectionSite ?? undefined,
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
    profileId: row.profileId,
  };
}

function toAppointmentDocument(row: typeof schema.appointmentDocuments.$inferSelect): AppointmentDocument {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileUri: row.fileUri,
    fileSize: row.fileSize ?? undefined,
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
    profileId: row.profileId,
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
    profileId: row.profileId,
  };
}

// ─── Migrations (legacy PRAGMA user_version) ──────────────────────────────

export async function initDatabase(): Promise<void> {
  expoDb.execSync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT 'blue',
      created_at TEXT NOT NULL,
      emergency_contact_name  TEXT,
      emergency_contact_phone TEXT
    );

    CREATE TABLE IF NOT EXISTS allergies (
      id         TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL DEFAULT 'default',
      name       TEXT NOT NULL,
      ing_rxcui  TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allergies_profile ON allergies(profile_id);

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
      is_prn        INTEGER NOT NULL DEFAULT 0,
      renewal_date  TEXT,
      renewal_notif_ids TEXT,
      prn_max_per_day INTEGER,
      prn_min_interval_minutes INTEGER,
      rxcui         TEXT,
      profile_id    TEXT NOT NULL DEFAULT 'default',
      regimen       TEXT,
      is_injectable INTEGER NOT NULL DEFAULT 0,
      archived_at    TEXT,
      archive_reason TEXT
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
      skip_reason     TEXT,
      injection_site  TEXT
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
      created_at        TEXT NOT NULL,
      profile_id        TEXT NOT NULL DEFAULT 'default'
    );

    CREATE TABLE IF NOT EXISTS health_measurements (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      value1       REAL NOT NULL,
      value2       REAL,
      measured_at  TEXT NOT NULL,
      notes        TEXT,
      created_at   TEXT NOT NULL,
      profile_id   TEXT NOT NULL DEFAULT 'default'
    );

    CREATE TABLE IF NOT EXISTS daily_checkins (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      mood        INTEGER NOT NULL,
      symptoms    TEXT NOT NULL DEFAULT '[]',
      notes       TEXT,
      created_at  TEXT NOT NULL,
      profile_id  TEXT NOT NULL DEFAULT 'default'
    );
  `);
  // NOTE: idx_checkin_profile_date (on daily_checkins.profile_id) is created by
  // the v14 migration below, NOT here. On an upgrade from a pre-multi-profile
  // DB (user_version < 14) the daily_checkins table already exists WITHOUT
  // profile_id, so `CREATE TABLE IF NOT EXISTS` is a no-op and a profile_id
  // index in this upfront block would throw "no such column: profile_id" and
  // brick startup. v14 adds the column (rebuilding the table) and then creates
  // the index — and v14 always runs on fresh installs too (user_version 0 < 14).

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

  if (user_version < 10) {
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS appointment_documents (
        id               TEXT PRIMARY KEY,
        appointment_id   TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        file_name        TEXT NOT NULL,
        mime_type        TEXT NOT NULL,
        file_uri         TEXT NOT NULL,
        file_size        INTEGER,
        created_at       TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_appointment_docs_appointment_id
        ON appointment_documents(appointment_id);
    `);
    expoDb.execSync("PRAGMA user_version = 10");
  }

  if (user_version < 11) {
    // F1: prescription-renewal reminders.
    for (const s of [
      "ALTER TABLE medications ADD COLUMN renewal_date TEXT",
      "ALTER TABLE medications ADD COLUMN renewal_notif_ids TEXT",
    ]) {
      try { expoDb.execSync(s); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 11");
  }

  if (user_version < 12) {
    // F2: PRN safety limits (max doses/day + minimum spacing).
    for (const s of [
      "ALTER TABLE medications ADD COLUMN prn_max_per_day INTEGER",
      "ALTER TABLE medications ADD COLUMN prn_min_interval_minutes INTEGER",
    ]) {
      try { expoDb.execSync(s); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 12");
  }

  if (user_version < 13) {
    // F2: RxNorm SXDG id captured from the autocomplete — powers the
    // duplicate-therapy checker.
    try { expoDb.execSync("ALTER TABLE medications ADD COLUMN rxcui TEXT"); } catch { /* exists */ }
    expoDb.execSync("PRAGMA user_version = 13");
  }

  if (user_version < 14) {
    // F2 multi-profile: profiles table + profile_id on person-owned roots.
    // The 'default' profile always exists; its empty name displays as a
    // localized "Me". Children (schedules, dose_logs, appointment_documents)
    // inherit scope through their medication/appointment FK.
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS profiles (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT 'blue',
        created_at TEXT NOT NULL
      );
    `);
    expoDb.execSync(
      `INSERT OR IGNORE INTO profiles (id, name, color, created_at)
       VALUES ('default', '', 'blue', '${new Date().toISOString()}');`
    );
    for (const table of ["medications", "appointments", "health_measurements"]) {
      try {
        expoDb.execSync(
          `ALTER TABLE ${table} ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default'`
        );
      } catch { /* exists */ }
    }
    // daily_checkins had UNIQUE(date); per-profile it must be
    // UNIQUE(profile_id, date) — SQLite requires a table rebuild. Guarded on
    // the column so a crash-interrupted run (rebuild done, user_version not
    // yet bumped) never rebuilds twice and corrupts profile assignments.
    const checkinCols = expoDb.getAllSync<{ name: string }>(
      "PRAGMA table_info(daily_checkins)"
    );
    if (!checkinCols.some((c) => c.name === "profile_id")) {
      expoDb.execSync(`
        DROP TABLE IF EXISTS daily_checkins_v14;
        CREATE TABLE daily_checkins_v14 (
          id         TEXT PRIMARY KEY,
          date       TEXT NOT NULL,
          mood       INTEGER NOT NULL,
          symptoms   TEXT NOT NULL DEFAULT '[]',
          notes      TEXT,
          created_at TEXT NOT NULL,
          profile_id TEXT NOT NULL DEFAULT 'default'
        );
        INSERT INTO daily_checkins_v14 (id, date, mood, symptoms, notes, created_at)
          SELECT id, date, mood, symptoms, notes, created_at FROM daily_checkins;
        DROP TABLE daily_checkins;
        ALTER TABLE daily_checkins_v14 RENAME TO daily_checkins;
      `);
    }
    expoDb.execSync(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_profile_date ON daily_checkins(profile_id, date);"
    );
    expoDb.execSync("PRAGMA user_version = 14");
  }

  if (user_version < 15) {
    // F3: complex regimens (everyN / cycle / taper) as nullable JSON.
    try { expoDb.execSync("ALTER TABLE medications ADD COLUMN regimen TEXT"); } catch { /* exists */ }
    expoDb.execSync("PRAGMA user_version = 15");
  }

  if (user_version < 16) {
    // F3: injectables — site rotation on dose logs, opt-in per medication.
    for (const stmt of [
      "ALTER TABLE medications ADD COLUMN is_injectable INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE dose_logs ADD COLUMN injection_site TEXT",
    ]) {
      try { expoDb.execSync(stmt); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 16");
  }

  if (user_version < 17) {
    // F3: allergies + emergency contact on profiles.
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS allergies (
        id         TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL DEFAULT 'default',
        name       TEXT NOT NULL,
        ing_rxcui  TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_allergies_profile ON allergies(profile_id);
    `);
    for (const stmt of [
      "ALTER TABLE profiles ADD COLUMN emergency_contact_name TEXT",
      "ALTER TABLE profiles ADD COLUMN emergency_contact_phone TEXT",
    ]) {
      try { expoDb.execSync(stmt); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 17");
  }

  if (user_version < 18) {
    // F3: archive instead of delete — history with a reason and a date.
    for (const stmt of [
      "ALTER TABLE medications ADD COLUMN archived_at TEXT",
      "ALTER TABLE medications ADD COLUMN archive_reason TEXT",
    ]) {
      try { expoDb.execSync(stmt); } catch { /* exists */ }
    }
    expoDb.execSync("PRAGMA user_version = 18");
  }
}


// ─── Profiles (F2 multi-profile) ───────────────────────────────────────────
// The 'default' profile always exists. UI lists use the getActive* getters
// below; alarm/background paths keep the unfiltered getters so every
// profile's doses keep ringing regardless of who is on screen.

export async function getProfiles(): Promise<Profile[]> {
  const rows = db.select().from(schema.profiles).orderBy(asc(schema.profiles.createdAt)).all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: r.createdAt,
    emergencyContactName: r.emergencyContactName ?? undefined,
    emergencyContactPhone: r.emergencyContactPhone ?? undefined,
  }));
}

export async function insertProfile(profile: Profile): Promise<void> {
  db.insert(schema.profiles).values({
    ...profile,
    emergencyContactName: profile.emergencyContactName ?? null,
    emergencyContactPhone: profile.emergencyContactPhone ?? null,
  }).run();
}

export async function updateProfile(profile: Profile): Promise<void> {
  db.update(schema.profiles)
    .set({
      name: profile.name,
      color: profile.color,
      emergencyContactName: profile.emergencyContactName ?? null,
      emergencyContactPhone: profile.emergencyContactPhone ?? null,
    })
    .where(eq(schema.profiles.id, profile.id))
    .run();
}

/**
 * Deletes a profile row and its person-owned data (appointments, health
 * measurements, check-ins). Medications are NOT touched here — the caller
 * must delete them first through the store so alarms and scheduled
 * notifications get cancelled (patient safety).
 */
export async function deleteProfileData(profileId: string): Promise<void> {
  if (profileId === DEFAULT_PROFILE_ID) {
    throw new Error("The default profile cannot be deleted");
  }
  db.delete(schema.allergies).where(eq(schema.allergies.profileId, profileId)).run();
  db.delete(schema.appointments).where(eq(schema.appointments.profileId, profileId)).run();
  db.delete(schema.healthMeasurements).where(eq(schema.healthMeasurements.profileId, profileId)).run();
  db.delete(schema.dailyCheckins).where(eq(schema.dailyCheckins.profileId, profileId)).run();
  db.delete(schema.profiles).where(eq(schema.profiles.id, profileId)).run();
}

// ─── Allergies (F3) ────────────────────────────────────────────────────────────────

export async function getActiveAllergies(): Promise<Allergy[]> {
  const rows = db.select().from(schema.allergies)
    .where(eq(schema.allergies.profileId, getActiveProfileId()))
    .orderBy(asc(schema.allergies.name))
    .all();
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profileId,
    name: r.name,
    ingRxcui: r.ingRxcui ?? undefined,
    createdAt: r.createdAt,
  }));
}

export async function insertAllergy(allergy: Allergy): Promise<void> {
  db.insert(schema.allergies).values({
    id: allergy.id,
    profileId: allergy.profileId ?? getActiveProfileId(),
    name: allergy.name,
    ingRxcui: allergy.ingRxcui ?? null,
    createdAt: allergy.createdAt,
  }).run();
}

/** Every profile's allergies — backup export only. */
export async function getAllAllergies(): Promise<Allergy[]> {
  const rows = db.select().from(schema.allergies).orderBy(asc(schema.allergies.createdAt)).all();
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profileId,
    name: r.name,
    ingRxcui: r.ingRxcui ?? undefined,
    createdAt: r.createdAt,
  }));
}

export async function deleteAllergy(id: string): Promise<void> {
  db.delete(schema.allergies).where(eq(schema.allergies.id, id)).run();
}

// ─── Medications ───────────────────────────────────────────────────────────

export async function getMedications(): Promise<Medication[]> {
  const rows = db.select().from(schema.medications).orderBy(desc(schema.medications.createdAt)).all();
  return rows.map(toMedication);
}

/** Medications of the active profile only — UI lists. Alarms use getMedications(). */
export async function getActiveMedications(): Promise<Medication[]> {
  const rows = db.select().from(schema.medications)
    .where(eq(schema.medications.profileId, getActiveProfileId()))
    .orderBy(desc(schema.medications.createdAt))
    .all();
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
    renewalDate: med.renewalDate ?? null,
    renewalNotifIds: med.renewalNotifIds ?? null,
    prnMaxPerDay: med.prnMaxPerDay ?? null,
    prnMinIntervalMinutes: med.prnMinIntervalMinutes ?? null,
    rxcui: med.rxcui ?? null,
    profileId: med.profileId ?? getActiveProfileId(),
    regimen: med.regimen ?? null,
    isInjectable: med.isInjectable ?? false,
    archivedAt: med.archivedAt ?? null,
    archiveReason: med.archiveReason ?? null,
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
    renewalDate: med.renewalDate ?? null,
    renewalNotifIds: med.renewalNotifIds ?? null,
    prnMaxPerDay: med.prnMaxPerDay ?? null,
    prnMinIntervalMinutes: med.prnMinIntervalMinutes ?? null,
    rxcui: med.rxcui ?? null,
    regimen: med.regimen ?? null,
    isInjectable: med.isInjectable ?? false,
    archivedAt: med.archivedAt ?? null,
    archiveReason: med.archiveReason ?? null,
  }).where(eq(schema.medications.id, med.id)).run();
}

/** Persists only the renewal-reminder notification ids for a medication. */
export async function setMedicationRenewalNotifIds(
  id: string,
  notifIds: string | null
): Promise<void> {
  db.update(schema.medications)
    .set({ renewalNotifIds: notifIds })
    .where(eq(schema.medications.id, id))
    .run();
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
 * Same delete-then-insert as upsertDoseLog but WITHOUT opening its own
 * transaction. Call this from code that is ALREADY inside a transaction
 * (e.g. backup import's `db.withTransactionAsync`). expo-sqlite/drizzle share a
 * single connection, so opening a nested transaction there throws
 * "cannot start a transaction within a transaction" — which previously made
 * every dose-log insert during a restore fail silently and drop 100% of the
 * user's adherence history (audit C1/C2).
 */
export async function upsertDoseLogNoTx(log: DoseLog): Promise<void> {
  db.delete(schema.doseLogs).where(
    and(eq(schema.doseLogs.scheduleId, log.scheduleId), eq(schema.doseLogs.scheduledDate, log.scheduledDate))
  ).run();
  db.insert(schema.doseLogs).values({
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
  db.delete(schema.appointmentDocuments).run();
  db.delete(schema.appointments).run();
  db.delete(schema.healthMeasurements).run();
  db.delete(schema.dailyCheckins).run();
  db.delete(schema.allergies).run();
  // Extra profiles go too; the built-in 'default' row must survive.
  db.delete(schema.profiles).where(ne(schema.profiles.id, DEFAULT_PROFILE_ID)).run();
}

// ─── Appointments ──────────────────────────────────────────────────────────

export async function getAppointments(): Promise<Appointment[]> {
  const rows = db.select().from(schema.appointments)
    .orderBy(asc(schema.appointments.date), asc(schema.appointments.time))
    .all();
  return rows.map(toAppointment);
}

/** Appointments of the active profile only — UI lists. */
export async function getActiveAppointments(): Promise<Appointment[]> {
  const rows = db.select().from(schema.appointments)
    .where(eq(schema.appointments.profileId, getActiveProfileId()))
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
    profileId: appt.profileId ?? getActiveProfileId(),
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

// ─── Appointment documents ─────────────────────────────────────────────────

export async function getAppointmentDocuments(appointmentId: string): Promise<AppointmentDocument[]> {
  const rows = db.select().from(schema.appointmentDocuments)
    .where(eq(schema.appointmentDocuments.appointmentId, appointmentId))
    .orderBy(desc(schema.appointmentDocuments.createdAt))
    .all();
  return rows.map(toAppointmentDocument);
}

export async function getAllAppointmentDocuments(): Promise<AppointmentDocument[]> {
  const rows = db.select().from(schema.appointmentDocuments)
    .orderBy(desc(schema.appointmentDocuments.createdAt))
    .all();
  return rows.map(toAppointmentDocument);
}

export async function insertAppointmentDocument(doc: AppointmentDocument): Promise<void> {
  db.insert(schema.appointmentDocuments).values({
    id: doc.id,
    appointmentId: doc.appointmentId,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileUri: doc.fileUri,
    fileSize: doc.fileSize ?? null,
    createdAt: doc.createdAt,
  }).run();
}

export async function deleteAppointmentDocument(id: string): Promise<void> {
  db.delete(schema.appointmentDocuments).where(eq(schema.appointmentDocuments.id, id)).run();
}

export async function updateMedicationStock(id: string, newQuantity: number): Promise<void> {
  db.update(schema.medications).set({ stockQuantity: newQuantity })
    .where(eq(schema.medications.id, id)).run();
}

/** Records the injection site on an already-logged dose (F3 injectables). */
export async function setDoseInjectionSite(
  scheduleId: string,
  scheduledDate: string,
  site: string
): Promise<void> {
  db.update(schema.doseLogs).set({ injectionSite: site })
    .where(and(eq(schema.doseLogs.scheduleId, scheduleId), eq(schema.doseLogs.scheduledDate, scheduledDate)))
    .run();
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

/** Measurements of the active profile only — UI lists. */
export async function getActiveHealthMeasurements(
  type?: MeasurementType,
  limit = 60
): Promise<HealthMeasurement[]> {
  const scope = eq(schema.healthMeasurements.profileId, getActiveProfileId());
  const rows = db.select().from(schema.healthMeasurements)
    .where(type ? and(scope, eq(schema.healthMeasurements.type, type)) : scope)
    .orderBy(desc(schema.healthMeasurements.measuredAt))
    .limit(limit)
    .all();
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
    profileId: m.profileId ?? getActiveProfileId(),
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

/** Check-ins of the active profile only — UI lists. */
export async function getActiveDailyCheckins(
  fromDate?: string,
  toDate?: string
): Promise<DailyCheckin[]> {
  const scope = eq(schema.dailyCheckins.profileId, getActiveProfileId());
  if (fromDate && toDate) {
    const rows = db.select().from(schema.dailyCheckins)
      .where(and(scope, gte(schema.dailyCheckins.date, fromDate), lte(schema.dailyCheckins.date, toDate)))
      .orderBy(desc(schema.dailyCheckins.date))
      .all();
    return rows.map(toDailyCheckin);
  }
  const rows = db.select().from(schema.dailyCheckins)
    .where(scope)
    .orderBy(desc(schema.dailyCheckins.date))
    .limit(90)
    .all();
  return rows.map(toDailyCheckin);
}

export async function getDailyCheckinByDate(date: string): Promise<DailyCheckin | null> {
  // One check-in per person per day — scoped to the active profile.
  const row = db.select().from(schema.dailyCheckins)
    .where(and(eq(schema.dailyCheckins.profileId, getActiveProfileId()), eq(schema.dailyCheckins.date, date)))
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
    profileId: checkin.profileId ?? getActiveProfileId(),
  }).onConflictDoUpdate({
    target: [schema.dailyCheckins.profileId, schema.dailyCheckins.date],
    set: {
      mood: checkin.mood,
      symptoms: JSON.stringify(checkin.symptoms),
      notes: checkin.notes ?? null,
    },
  }).run();
}
