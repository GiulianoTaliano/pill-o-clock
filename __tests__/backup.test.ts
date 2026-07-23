/**
 * __tests__/backup.test.ts
 *
 * Export→import round-trip for the backup service. zod strips unknown keys on
 * parse, so any Medication field missing from medicationSchema is silently
 * dropped on import — user data loss (this once bit renewalDate, the PRN
 * safety limits and rxcui).
 *
 * Key assertions:
 *  - The exported JSON carries every Medication field as-is.
 *  - A Medication with ALL optional fields set survives export→import.
 *  - renewalNotifIds is the one intentional exception (device-local OS ids).
 *  - Legacy backups without the newer optional fields still import.
 */

import { exportBackup, importBackup } from "../src/services/backup";
import { makeMedication } from "./factories";
import type { Medication } from "../src/types";

jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: {},
}));

jest.mock("expo-file-system/src/legacy", () => ({
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("../src/db/database", () => ({
  getDb: jest.fn(),
  getMedications: jest.fn(),
  getAllSchedules: jest.fn(),
  getAllDoseLogs: jest.fn(),
  getAppointments: jest.fn(),
  getAllAppointmentDocuments: jest.fn(),
  getHealthMeasurements: jest.fn(),
  getDailyCheckins: jest.fn(),
  getProfiles: jest.fn(),
  getAllAllergies: jest.fn(),
  clearAllData: jest.fn(),
  insertMedication: jest.fn(),
  insertSchedule: jest.fn(),
  upsertDoseLogNoTx: jest.fn(),
  insertAppointment: jest.fn(),
  insertAppointmentDocument: jest.fn(),
  insertHealthMeasurement: jest.fn(),
  upsertDailyCheckin: jest.fn(),
  insertProfile: jest.fn(),
  insertAllergy: jest.fn(),
}));

import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/src/legacy";
import * as db from "../src/db/database";

/**
 * Every optional Medication field set. `Required<>` makes this fail to compile
 * whenever a new field is added to the type, forcing the author to decide
 * whether it round-trips through medicationSchema.
 */
const FULL_MED: Required<Medication> = {
  ...makeMedication(),
  notes: "tomar con comida",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  stockQuantity: 30,
  stockAlertThreshold: 5,
  photoUri: "file:///photos/med-1.jpg",
  isPRN: true,
  renewalDate: "2026-08-15",
  renewalNotifIds: "notif-a|notif-b",
  prnMaxPerDay: 4,
  prnMinIntervalMinutes: 360,
  rxcui: "1049221",
  profileId: "profile-2",
  regimen: '{"type":"everyN","intervalDays":2}',
  isInjectable: true,
  archivedAt: "2026-07-01T00:00:00.000Z",
  archiveReason: "doctor",
};

/** Runs exportBackup with the given entities and returns the JSON it wrote. */
async function runExport(medications: Medication[]): Promise<string> {
  jest.mocked(db.getMedications).mockResolvedValue(medications);
  jest.mocked(db.getAllSchedules).mockResolvedValue([]);
  jest.mocked(db.getAllDoseLogs).mockResolvedValue([]);
  jest.mocked(db.getAppointments).mockResolvedValue([]);
  jest.mocked(db.getAllAppointmentDocuments).mockResolvedValue([]);
  jest.mocked(db.getHealthMeasurements).mockResolvedValue([]);
  jest.mocked(db.getDailyCheckins).mockResolvedValue([]);
  jest.mocked(db.getProfiles).mockResolvedValue([]);
  jest.mocked(db.getAllAllergies).mockResolvedValue([]);

  jest
    .mocked(StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValue({ granted: true, directoryUri: "content://backups" } as never);
  jest.mocked(StorageAccessFramework.createFileAsync).mockResolvedValue("content://backups/f");

  let written = "";
  jest
    .mocked(StorageAccessFramework.writeAsStringAsync)
    .mockImplementation(async (_uri: string, json: string) => {
      written = json;
    });

  await exportBackup();
  return written;
}

/** Minimal mock surface for casts where jest.mocked's typing doesn't fit
 *  (class constructors, partial fakes). */
type AnyMock = {
  mockImplementation: (fn: (...args: never[]) => unknown) => void;
  mockResolvedValue: (value: unknown) => void;
};

/** Runs importBackup("replace") against the given backup JSON. */
async function runImport(json: string): Promise<{ count: number }> {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///picked.json" }],
  } as never);
  (File as unknown as AnyMock).mockImplementation(() => ({
    text: async () => json,
    delete: jest.fn(),
  }));
  (db.getDb as unknown as AnyMock).mockResolvedValue({
    withTransactionAsync: (fn: () => Promise<void>) => fn(),
  });
  return importBackup("replace");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("backup export→import round-trip", () => {
  it("exports every Medication field as-is", async () => {
    const written = await runExport([FULL_MED]);
    const parsed = JSON.parse(written);
    expect(parsed.data.medications[0]).toEqual(FULL_MED);
  });

  it("a Medication with all optional fields survives import", async () => {
    const written = await runExport([FULL_MED]);
    const { count } = await runImport(written);

    expect(count).toBe(1);
    expect(db.clearAllData).toHaveBeenCalled();

    const imported = jest.mocked(db.insertMedication).mock.calls[0][0];
    // renewalNotifIds is intentionally stripped (see medicationSchema): OS
    // notification ids are device-local. toEqual fails on extra *defined*
    // keys, so this also proves the field did not sneak through.
    const { renewalNotifIds: _deviceLocal, ...expected } = FULL_MED;
    expect(imported).toEqual(expected);
    expect("renewalNotifIds" in imported).toBe(false);

    // Spell out the patient-safety / identity fields the schema once dropped.
    expect(imported.renewalDate).toBe("2026-08-15");
    expect(imported.prnMaxPerDay).toBe(4);
    expect(imported.prnMinIntervalMinutes).toBe(360);
    expect(imported.rxcui).toBe("1049221");
    expect(imported.profileId).toBe("profile-2");
  });

  it("still imports a legacy backup without the newer optional fields", async () => {
    const legacy = JSON.stringify({
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      app: "pill-o-clock",
      data: { medications: [makeMedication()] },
    });
    const { count } = await runImport(legacy);
    expect(count).toBe(1);
    expect(jest.mocked(db.insertMedication).mock.calls[0][0]).toEqual(makeMedication());
  });
});
