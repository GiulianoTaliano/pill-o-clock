import { Directory, File, Paths } from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/src/legacy";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { z } from "zod";
import {
  encryptBackup,
  decryptBackup,
  isEncryptedEnvelope,
  WrongPassphraseError,
} from "./backupCrypto";
import {
  Medication,
  Schedule,
  DoseLog,
  Appointment,
  AppointmentDocument,
  HealthMeasurement,
  DailyCheckin,
  Allergy,
} from "../types";
import {
  getDb,
  getMedications,
  getAllSchedules,
  getAllDoseLogs,
  getAppointments,
  getAllAppointmentDocuments,
  getAllHealthMeasurements,
  getAllDailyCheckins,
  clearAllDataNoTx,
  insertMedication,
  insertSchedule,
  upsertDoseLogNoTx,
  insertAppointment,
  insertAppointmentDocument,
  insertHealthMeasurement,
  upsertDailyCheckin,
  getProfiles,
  insertProfile,
  updateProfile,
  reconcileActiveProfile,
  getAllAllergies,
  insertAllergy,
  updateAppointment,
  setMedicationRenewalNotifIds,
} from "../db/database";
import {
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
  scheduleRenewalReminders,
  cancelRenewalReminders,
  cancelScheduleNotifications,
  rebuildDoseNotifications,
} from "./notifications";
import { generateId } from "../utils";
import { DEFAULT_PROFILE_ID } from "./profileStore";

// ─── Zod schemas ───────────────────────────────────────────────────────────

const medicationSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  dosageAmount: z.number(),
  dosageUnit: z.enum([
    "mg",
    "g",
    "mcg",
    "ml",
    "gotas",
    "comprimidos",
    "capsulas",
    "UI",
  ]),
  dosage: z.string(),
  category: z.enum([
    "antibiotico",
    "analgesico",
    "antiinflamatorio",
    "suplemento",
    "vitamina",
    "otro",
  ]),
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
  renewalDate: z.string().optional(),
  // renewalNotifIds is deliberately absent: OS notification ids only exist on
  // the device that scheduled them, so a restored install would believe
  // reminders are scheduled when nothing is. zod strips the key on parse;
  // importBackup reschedules renewal reminders for the medications it inserts.
  prnMaxPerDay: z.number().optional(),
  prnMinIntervalMinutes: z.number().optional(),
  rxcui: z.string().optional(),
  profileId: z.string().optional(),
  regimen: z.string().optional(),
  isInjectable: z.boolean().optional(),
  archivedAt: z.string().optional(),
  archiveReason: z.string().optional(),
});

const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

const allergySchema = z.object({
  id: z.string(),
  profileId: z.string().optional(),
  name: z.string(),
  ingRxcui: z.string().optional(),
  createdAt: z.string(),
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
  injectionSite: z.string().optional(),
  stockDelta: z.number().finite().optional(),
});

const appointmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  doctor: z.string().optional(),
  location: z.string().optional(),
  locationCoords: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
  notes: z.string().optional(),
  date: z.string(),
  time: z.string().optional(),
  reminderMinutes: z.number().optional(),
  // notificationId is deliberately absent (same reason as renewalNotifIds
  // above): the id references a notification queued on the exporting device,
  // so a restored install would believe a reminder is scheduled when nothing
  // is. zod strips the key on parse; importBackup reschedules reminders for
  // the appointments it inserts.
  createdAt: z.string(),
  profileId: z.string().optional(),
});

const appointmentDocumentSchema = z.object({
  id: z.string(),
  appointmentId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileUri: z.string(),
  fileSize: z.number().optional(),
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
  profileId: z.string().optional(),
});

const dailyCheckinSchema = z.object({
  id: z.string(),
  date: z.string(),
  mood: z.number().int().min(1).max(5),
  symptoms: z.array(z.string()),
  notes: z.string().optional(),
  createdAt: z.string(),
  profileId: z.string().optional(),
});

const backupSchema = z.object({
  version: z.number().int().min(1).max(4),
  exportedAt: z.string(),
  app: z.literal("pill-o-clock"),
  attachments: z
    .array(
      z.object({
        kind: z.enum(["photo", "document"]),
        ownerId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        base64: z
          .string()
          .regex(
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
          ),
      })
    )
    .default([]),
  data: z.object({
    medications: z.array(medicationSchema),
    schedules: z.array(scheduleSchema).default([]),
    doseLogs: z.array(doseLogSchema).default([]),
    appointments: z.array(appointmentSchema).default([]),
    appointmentDocuments: z.array(appointmentDocumentSchema).default([]),
    healthMeasurements: z.array(healthMeasurementSchema).default([]),
    dailyCheckins: z.array(dailyCheckinSchema).default([]),
    profiles: z.array(profileSchema).default([]),
    allergies: z.array(allergySchema).default([]),
  }),
});

// ─── Types ─────────────────────────────────────────────────────────────────

export type BackupData = z.infer<typeof backupSchema>;

// ─── Portable backup and non-destructive restore ────────────────────────────
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
export class BackupAttachmentError extends Error {
  constructor() {
    super("attachment_unavailable");
  }
}
export type ImportMode = "replace" | "merge";
type TableName = keyof BackupData["data"];
export type BackupCounts = Record<TableName, number>;
export interface BackupPreview {
  exportedAt: string;
  version: number;
  profiles: string[];
  counts: BackupCounts;
  conflicts: BackupCounts;
  missingAttachments: number;
}
export interface ImportResult {
  count: number;
  inserted: BackupCounts;
  skipped: BackupCounts;
  reminderErrors: number;
  missingAttachments: number;
}
const tables: TableName[] = [
  "profiles",
  "medications",
  "schedules",
  "doseLogs",
  "appointments",
  "appointmentDocuments",
  "healthMeasurements",
  "dailyCheckins",
  "allergies",
];
const emptyCounts = (): BackupCounts =>
  Object.fromEntries(tables.map((key) => [key, 0])) as BackupCounts;

async function readDatabase(): Promise<BackupData["data"]> {
  const [
    medications,
    schedules,
    doseLogs,
    appointments,
    appointmentDocuments,
    healthMeasurements,
    dailyCheckins,
    profiles,
    allergies,
  ] = await Promise.all([
    getMedications(),
    getAllSchedules(),
    getAllDoseLogs(),
    getAppointments(),
    getAllAppointmentDocuments(),
    getAllHealthMeasurements(),
    getAllDailyCheckins(),
    getProfiles(),
    getAllAllergies(),
  ]);
  return {
    medications,
    schedules,
    doseLogs,
    appointments,
    appointmentDocuments,
    healthMeasurements,
    dailyCheckins,
    profiles,
    allergies,
  };
}

export async function exportBackup(
  passphrase?: string
): Promise<{ missingAttachments: number }> {
  const data = await readDatabase();
  const attachments: BackupData["attachments"] = [];
  // An unreadable file (evicted picker cache, or a path restored from another
  // device) must not block every future backup of the records themselves: the
  // copy is written without those bytes and the caller reports how many.
  let missingAttachments = 0;
  const readBase64 = async (uri: string) => {
    try {
      return await new File(uri).base64();
    } catch {
      missingAttachments++;
      return null;
    }
  };
  for (const med of data.medications) {
    if (!med.photoUri) continue;
    const extension =
      med.photoUri
        .split(/[?#]/)[0]
        .match(/\.(png|webp|heic|jpe?g)$/i)?.[1]
        .toLowerCase() ?? "jpg";
    const mimeType =
      extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : "image/" + extension;
    const base64 = await readBase64(med.photoUri);
    if (base64 == null) {
      // A v4 copy never references a photo it does not carry.
      med.photoUri = undefined;
      continue;
    }
    attachments.push({
      kind: "photo",
      ownerId: med.id,
      fileName: "photo." + extension,
      mimeType,
      base64,
    });
  }
  const documents: typeof data.appointmentDocuments = [];
  for (const doc of data.appointmentDocuments) {
    const base64 = await readBase64(doc.fileUri);
    // A document row without its file cannot be opened anywhere; leave it out.
    if (base64 == null) continue;
    documents.push(doc);
    attachments.push({
      kind: "document",
      ownerId: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      base64,
    });
  }
  data.appointmentDocuments = documents;
  const backup: BackupData = {
    version: 4,
    exportedAt: new Date().toISOString(),
    app: "pill-o-clock",
    data,
    attachments,
  };
  const plain = JSON.stringify(backup);
  const contents = passphrase ? encryptBackup(plain, passphrase) : plain;
  const filename =
    "pilloclock-backup-" +
    new Date().toISOString().slice(0, 10) +
    (passphrase ? ".encrypted.json" : ".json");
  if (Platform.OS === "android") {
    const permission =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) throw new BackupCancelledError();
    const uri = await StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      filename,
      "application/json"
    );
    await StorageAccessFramework.writeAsStringAsync(uri, contents);
    return { missingAttachments };
  }
  if (Platform.OS === "web") {
    const uri = URL.createObjectURL(
      new Blob([contents], { type: "application/json" })
    );
    try {
      const link = document.createElement("a");
      link.href = uri;
      link.download = filename;
      link.click();
    } finally {
      URL.revokeObjectURL(uri);
    }
    return { missingAttachments };
  }
  const file = new File(Paths.cache, filename);
  try {
    file.create({ overwrite: true });
    file.write(contents);
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      /* cache cleanup must not misreport a shared copy */
    }
  }
  return { missingAttachments };
}

function keyFor(
  table: TableName,
  row: BackupData["data"][TableName][number]
): string {
  if (table === "doseLogs") {
    const log = row as DoseLog;
    return log.scheduleId + "|" + log.scheduledDate;
  }
  if (table === "dailyCheckins") {
    const checkin = row as DailyCheckin;
    return (checkin.profileId ?? DEFAULT_PROFILE_ID) + "|" + checkin.date;
  }
  if (table === "allergies") {
    const allergy = row as Allergy;
    return (
      (allergy.profileId ?? DEFAULT_PROFILE_ID) +
      "|" +
      allergy.name.trim().toLocaleLowerCase()
    );
  }
  return row.id;
}

/** Merge preserves existing facts, including dose status and diary entries. */
export function planBackupMerge(
  incoming: BackupData["data"],
  existing: BackupData["data"]
) {
  const conflicts = emptyCounts();
  const main = existing.profiles.find((p) => p.id === DEFAULT_PROFILE_ID);
  const mainHasFacts =
    [
      existing.medications,
      existing.appointments,
      existing.healthMeasurements,
      existing.dailyCheckins,
      existing.allergies,
    ].some((rows) =>
      rows.some(
        (row) => (row.profileId ?? DEFAULT_PROFILE_ID) === DEFAULT_PROFILE_ID
      )
    ) || existing.doseLogs.length > 0;
  const emptyMain =
    main &&
    !main.name.trim() &&
    !main.emergencyContactName &&
    !main.emergencyContactPhone &&
    main.color === "blue" &&
    !mainHasFacts;
  const selected = Object.fromEntries(
    tables.map((table) => {
      // The empty built-in row on a new installation is a placeholder, not a
      // competing person's facts. An edited or populated main profile is kept.
      const current =
        table === "profiles" && emptyMain
          ? existing[table].filter((row) => row.id !== DEFAULT_PROFILE_ID)
          : existing[table];
      const keys = new Set(current.map((row) => keyFor(table, row)));
      const ids = new Set(current.map((row) => row.id));
      const rows = incoming[table].filter((row) => {
        const key = keyFor(table, row);
        if (keys.has(key) || ids.has(row.id)) {
          conflicts[table]++;
          return false;
        }
        keys.add(key);
        ids.add(row.id);
        return true;
      });
      return [table, rows];
    })
  ) as BackupData["data"];
  // A medication kept from this device keeps its own current schedules: an old
  // backup must not resurrect a dose time that was removed since.
  const insertedMeds = new Set(selected.medications.map((m) => m.id));
  selected.schedules = selected.schedules.filter((schedule) => {
    if (insertedMeds.has(schedule.medicationId)) return true;
    conflicts.schedules++;
    return false;
  });
  return { selected, conflicts };
}

function validateReferences(
  backup: BackupData,
  existing: BackupData["data"],
  mode: ImportMode
) {
  if (mode === "replace")
    for (const table of tables) {
      const keys = new Set<string>();
      const ids = new Set<string>();
      for (const row of backup.data[table]) {
        const key = keyFor(table, row);
        // Allergy names have no unique constraint and older versions allowed
        // "Penicilina" and "penicilina" side by side; only ids must be unique.
        if ((table !== "allergies" && keys.has(key)) || ids.has(row.id))
          throw new BackupFormatError();
        keys.add(key);
        ids.add(row.id);
      }
    }
  const profileIds = new Set([
    DEFAULT_PROFILE_ID,
    ...backup.data.profiles.map((p) => p.id),
    ...(mode === "merge" ? existing.profiles.map((p) => p.id) : []),
  ]);
  for (const rows of [
    backup.data.medications,
    backup.data.appointments,
    backup.data.healthMeasurements,
    backup.data.dailyCheckins,
    backup.data.allergies,
  ]) {
    if (rows.some((r) => !profileIds.has(r.profileId ?? DEFAULT_PROFILE_ID)))
      throw new BackupFormatError();
  }
  const medicationIds = new Set([
    ...backup.data.medications.map((m) => m.id),
    ...(mode === "merge" ? existing.medications.map((m) => m.id) : []),
  ]);
  const appointmentIds = new Set([
    ...backup.data.appointments.map((a) => a.id),
    ...(mode === "merge" ? existing.appointments.map((a) => a.id) : []),
  ]);
  if (
    backup.data.schedules.some((s) => !medicationIds.has(s.medicationId)) ||
    backup.data.appointmentDocuments.some(
      (d) => !appointmentIds.has(d.appointmentId)
    )
  )
    throw new BackupFormatError();
  const assets = new Set<string>();
  for (const asset of backup.attachments) {
    const key = asset.kind + "|" + asset.ownerId;
    if (assets.has(key)) throw new BackupFormatError();
    assets.add(key);
  }
  if (
    backup.version >= 4 &&
    (backup.data.medications.some(
      (m) => m.photoUri && !assets.has("photo|" + m.id)
    ) ||
      backup.data.appointmentDocuments.some(
        (d) => !assets.has("document|" + d.id)
      ))
  )
    throw new BackupFormatError();
}

/**
 * Pick, validate and preview before any write. The optional confirmation may change
 * the mode; returning null cancels without touching files, rows or live reminders.
 */
export async function importBackup(
  mode: ImportMode,
  getPassphrase?: () => Promise<string | null>,
  confirm?: (preview: BackupPreview) => Promise<ImportMode | null>
): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) throw new BackupCancelledError();
  const tempFile = new File(picked.assets[0].uri);
  const createdFiles: File[] = [];
  let committed = false;
  try {
    let raw: unknown;
    try {
      raw = JSON.parse(await tempFile.text());
    } catch {
      throw new BackupFormatError();
    }
    if (isEncryptedEnvelope(raw)) {
      const password = await getPassphrase?.();
      if (password == null) throw new BackupCancelledError();
      const decrypted = decryptBackup(raw, password);
      try {
        raw = JSON.parse(decrypted);
      } catch {
        throw new BackupFormatError();
      }
    }
    const parsed = backupSchema.safeParse(raw);
    if (!parsed.success) throw new BackupFormatError();
    const backup = parsed.data;
    const existing = await readDatabase();
    validateReferences(backup, existing, mode);
    const merge = planBackupMerge(backup.data, existing);
    const missingAttachments =
      backup.version < 4
        ? backup.data.medications.filter((m) => m.photoUri).length +
          backup.data.appointmentDocuments.length
        : 0;
    if (confirm) {
      const decision = await confirm({
        exportedAt: backup.exportedAt,
        version: backup.version,
        profiles: backup.data.profiles.map((p) => p.name || p.id),
        counts: Object.fromEntries(
          tables.map((key) => [key, backup.data[key].length])
        ) as BackupCounts,
        conflicts: merge.conflicts,
        missingAttachments,
      });
      if (!decision) throw new BackupCancelledError();
      mode = decision;
    }
    validateReferences(backup, existing, mode);
    const selected = mode === "merge" ? merge.selected : backup.data;
    // Legacy backups predate profiles and belong to the main person, even if
    // another profile happened to be selected before this restore.
    for (const rows of [
      selected.medications,
      selected.appointments,
      selected.healthMeasurements,
      selected.dailyCheckins,
      selected.allergies,
    ]) {
      for (const row of rows) row.profileId ??= DEFAULT_PROFILE_ID;
    }
    const inserted = emptyCounts();
    const skipped = mode === "merge" ? merge.conflicts : emptyCounts();
    const newMedIds = new Set(selected.medications.map((m) => m.id));
    const newDocIds = new Set(selected.appointmentDocuments.map((d) => d.id));
    for (const asset of backup.attachments) {
      if (!(asset.kind === "photo" ? newMedIds : newDocIds).has(asset.ownerId))
        continue;
      const dir = new Directory(Paths.document, "restored-assets");
      dir.create({ intermediates: true, idempotent: true });
      const extension =
        asset.fileName.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] ?? ".bin";
      const file = new File(dir, generateId() + extension);
      file.create();
      createdFiles.push(file);
      file.write(asset.base64, { encoding: "base64" });
      if (asset.kind === "photo") {
        const med = selected.medications.find((m) => m.id === asset.ownerId)!;
        med.photoUri = file.uri;
      } else {
        const doc = selected.appointmentDocuments.find(
          (d) => d.id === asset.ownerId
        )!;
        doc.fileUri = file.uri;
      }
    }
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      if (mode === "replace") await clearAllDataNoTx();
      for (const p of selected.profiles) {
        if (p.id === DEFAULT_PROFILE_ID) await updateProfile(p);
        else await insertProfile(p);
        inserted.profiles++;
      }
      for (const m of selected.medications) {
        await insertMedication(m as Medication);
        inserted.medications++;
      }
      for (const s of selected.schedules) {
        await insertSchedule(s as Schedule);
        inserted.schedules++;
      }
      for (const l of selected.doseLogs) {
        await upsertDoseLogNoTx(l as DoseLog);
        inserted.doseLogs++;
      }
      for (const a of selected.appointments) {
        await insertAppointment(a as Appointment);
        inserted.appointments++;
      }
      for (const d of selected.appointmentDocuments) {
        await insertAppointmentDocument(d as AppointmentDocument);
        inserted.appointmentDocuments++;
      }
      for (const h of selected.healthMeasurements) {
        await insertHealthMeasurement(h as HealthMeasurement);
        inserted.healthMeasurements++;
      }
      for (const c of selected.dailyCheckins) {
        await upsertDailyCheckin(c as DailyCheckin);
        inserted.dailyCheckins++;
      }
      for (const a of selected.allergies) {
        await insertAllergy(a as Allergy);
        inserted.allergies++;
      }
    });
    committed = true;
    await reconcileActiveProfile();
    let reminderErrors = 0;
    const attempt = async (work: () => Promise<unknown>) => {
      try {
        await work();
      } catch {
        reminderErrors++;
      }
    };
    if (mode === "replace") {
      for (const s of existing.schedules)
        await attempt(() => cancelScheduleNotifications(s.id));
      for (const a of existing.appointments as Appointment[])
        if (a.notificationId)
          await attempt(() => cancelAppointmentNotification(a.notificationId!));
      for (const m of existing.medications as Medication[])
        if (m.renewalNotifIds) await attempt(() => cancelRenewalReminders(m));
    }
    for (const a of selected.appointments) {
      await attempt(async () => {
        const notificationId = await scheduleAppointmentNotification(
          a as Appointment
        );
        if (notificationId)
          await updateAppointment({ ...a, notificationId } as Appointment);
      });
    }
    for (const m of selected.medications) {
      if (!m.renewalDate) continue;
      await attempt(async () => {
        const ids = await scheduleRenewalReminders(m as Medication);
        if (ids) await setMedicationRenewalNotifIds(m.id, ids);
      });
    }
    await attempt(rebuildDoseNotifications);
    return {
      count: inserted.medications,
      inserted,
      skipped,
      reminderErrors,
      missingAttachments,
    };
  } finally {
    if (!committed)
      for (const file of createdFiles) {
        try {
          file.delete();
        } catch {
          /* preserve original files */
        }
      }
    try {
      tempFile.delete();
    } catch {
      /* cache cleanup */
    }
  }
}
export { WrongPassphraseError };
