import { File, Paths } from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/src/legacy";
import * as DocumentPicker from "expo-document-picker";
import { z } from "zod";
import { Medication, Schedule, DoseLog, Appointment, HealthMeasurement, DailyCheckin } from "../types";
import {
  getDb,
  getMedications,
  getAllSchedules,
  getAllDoseLogs,
  getAppointments,
  getHealthMeasurements,
  getDailyCheckins,
  clearAllData,
  insertMedication,
  insertSchedule,
  upsertDoseLog,
  insertAppointment,
  insertHealthMeasurement,
  upsertDailyCheckin,
} from "../db/database";

// ─── Zod schemas ───────────────────────────────────────────────────────────

const medicationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  dosageAmount: z.number(),
  dosageUnit: z.enum(["mg", "g", "mcg", "ml", "gotas", "comprimidos", "capsulas", "UI"]),
  dosage: z.string(),
  category: z.enum(["antibiotico", "analgesico", "antiinflamatorio", "suplemento", "vitamina", "otro"]),
  notes: z.string().optional(),
  color: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  stockQuantity: z.number().optional(),
  stockAlertThreshold: z.number().optional(),
  photoUri: z.string().optional(),
  isPRN: z.boolean().optional(),
});

const scheduleSchema = z.object({
  id: z.string(),
  medicationId: z.string(),
  time: z.string(),
  days: z.array(z.number()),
  isActive: z.boolean(),
});

const doseLogSchema = z.object({
  id: z.string(),
  medicationId: z.string(),
  scheduleId: z.string(),
  scheduledDate: z.string(),
  scheduledTime: z.string(),
  status: z.enum(["pending", "taken", "skipped", "missed"]),
  takenAt: z.string().optional(),
  createdAt: z.string(),
  notes: z.string().optional(),
  skipReason: z.enum(["forgot", "side_effect", "no_stock", "other"]).optional(),
});

const appointmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  doctor: z.string().optional(),
  location: z.string().optional(),
  locationCoords: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  notes: z.string().optional(),
  date: z.string(),
  time: z.string().optional(),
  reminderMinutes: z.number().optional(),
  notificationId: z.string().optional(),
  createdAt: z.string(),
});

const healthMeasurementSchema = z.object({
  id: z.string(),
  type: z.enum(["blood_pressure", "glucose", "weight", "spo2", "heart_rate"]),
  value1: z.number(),
  value2: z.number().optional(),
  measuredAt: z.string(),
  notes: z.string().optional(),
  createdAt: z.string(),
});

const dailyCheckinSchema = z.object({
  id: z.string(),
  date: z.string(),
  mood: z.number().int().min(1).max(5),
  symptoms: z.array(z.string()),
  notes: z.string().optional(),
  createdAt: z.string(),
});

const backupSchema = z.object({
  version: z.number().int().min(1),
  exportedAt: z.string(),
  app: z.literal("pill-o-clock"),
  data: z.object({
    medications: z.array(medicationSchema),
    schedules: z.array(scheduleSchema).default([]),
    doseLogs: z.array(doseLogSchema).default([]),
    appointments: z.array(appointmentSchema).default([]),
    healthMeasurements: z.array(healthMeasurementSchema).default([]),
    dailyCheckins: z.array(dailyCheckinSchema).default([]),
  }),
});

// ─── Types ─────────────────────────────────────────────────────────────────

export type BackupData = z.infer<typeof backupSchema>;

// ─── Export ────────────────────────────────────────────────────────────────

/** Serialises the entire database into a JSON file and lets the user
 *  pick a folder via the system file picker (SAF) to save it. */
export async function exportBackup(): Promise<void> {
  const [medications, schedules, doseLogs, appointments, healthMeasurements, dailyCheckins] = await Promise.all([
    getMedications(),
    getAllSchedules(),
    getAllDoseLogs(),
    getAppointments(),
    getHealthMeasurements(undefined, 9999),
    getDailyCheckins(),
  ]);

  const backup: BackupData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: "pill-o-clock",
    data: { medications, schedules, doseLogs, appointments, healthMeasurements, dailyCheckins },
  };

  const json = JSON.stringify(backup, null, 2);
  const date = new Date().toISOString().split("T")[0];
  const filename = `pilloclock-backup-${date}`;

  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) throw new BackupCancelledError();

  const fileUri = await StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    filename,
    "application/json",
  );
  await StorageAccessFramework.writeAsStringAsync(fileUri, json);
}

// ─── Import ────────────────────────────────────────────────────────────────

export class BackupCancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

export class BackupFormatError extends Error {
  constructor() {
    super("invalid_format");
  }
}

/**
 * Opens the document picker, parses the selected JSON backup, and restores
 * it to the database.
 *
 * @param mode
 *   - `"replace"`: wipes existing data, then inserts everything from the file.
 *   - `"merge"`: keeps existing rows; new records are upserted on top.
 *
 * @returns `{ count }` — number of medications that were imported.
 */
export async function importBackup(
  mode: "replace" | "merge"
): Promise<{ count: number }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
  });

  if (result.canceled) throw new BackupCancelledError();

  const uri = result.assets[0].uri;
  const tempFile = new File(uri);
  const json = await tempFile.text();

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupFormatError();
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new BackupFormatError();

  const backup = parsed.data;
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    if (mode === "replace") {
      await clearAllData();
    }

    for (const med of backup.data.medications) {
      try {
        await insertMedication(med as Medication);
      } catch {
        // On merge mode a duplicate ID means the record already exists — skip it.
      }
    }

    for (const sched of backup.data.schedules) {
      try {
        await insertSchedule(sched as Schedule);
      } catch {
        // Skip duplicates on merge.
      }
    }

    for (const log of backup.data.doseLogs) {
      try {
        await upsertDoseLog(log as DoseLog);
      } catch {
        // upsertDoseLog already handles conflicts — this is just a safety net.
      }
    }

    for (const appt of backup.data.appointments) {
      try {
        await insertAppointment(appt as Appointment);
      } catch {
        // Skip duplicates on merge.
      }
    }

    for (const m of backup.data.healthMeasurements) {
      try {
        await insertHealthMeasurement(m as HealthMeasurement);
      } catch {
        // Skip duplicates on merge.
      }
    }

    for (const ci of backup.data.dailyCheckins) {
      try {
        await upsertDailyCheckin(ci as DailyCheckin);
      } catch {
        // upsertDailyCheckin handles conflicts.
      }
    }
  });

  return { count: backup.data.medications.length };
}
