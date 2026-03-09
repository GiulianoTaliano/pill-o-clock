import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Medication, Schedule, DoseLog } from "../types";
import {
  getMedications,
  getAllSchedules,
  getAllDoseLogs,
  clearAllData,
  insertMedication,
  insertSchedule,
  upsertDoseLog,
} from "../db/database";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BackupData {
  version: number;
  exportedAt: string;
  app: "pill-o-clock";
  data: {
    medications: Medication[];
    schedules: Schedule[];
    doseLogs: DoseLog[];
  };
}

// ─── Export ────────────────────────────────────────────────────────────────

/** Serialises the entire database into a JSON file and opens the system
 *  share sheet so the user can save it wherever they want. */
export async function exportBackup(): Promise<void> {
  const [medications, schedules, doseLogs] = await Promise.all([
    getMedications(),
    getAllSchedules(),
    getAllDoseLogs(),
  ]);

  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "pill-o-clock",
    data: { medications, schedules, doseLogs },
  };

  const json = JSON.stringify(backup, null, 2);
  const date = new Date().toISOString().split("T")[0];
  const filename = `pilloclock-backup-${date}.json`;

  const file = new File(Paths.cache, filename);
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Pill O-Clock backup",
    });
  }
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

  let backup: BackupData;
  try {
    backup = JSON.parse(json);
  } catch {
    throw new BackupFormatError();
  }

  if (
    !backup ||
    backup.app !== "pill-o-clock" ||
    !backup.data ||
    !Array.isArray(backup.data.medications)
  ) {
    throw new BackupFormatError();
  }

  if (mode === "replace") {
    await clearAllData();
  }

  for (const med of backup.data.medications) {
    try {
      await insertMedication(med);
    } catch {
      // On merge mode a duplicate ID means the record already exists — skip it.
    }
  }

  for (const sched of backup.data.schedules ?? []) {
    try {
      await insertSchedule(sched);
    } catch {
      // Skip duplicates on merge.
    }
  }

  for (const log of backup.data.doseLogs ?? []) {
    try {
      await upsertDoseLog(log);
    } catch {
      // upsertDoseLog already handles conflicts — this is just a safety net.
    }
  }

  return { count: backup.data.medications.length };
}
