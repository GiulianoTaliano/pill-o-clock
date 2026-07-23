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
 *  - renewalNotifIds is the one intentional exception (device-local OS ids),
 *    and import reschedules renewal reminders on the importing device instead.
 *  - Appointment.notificationId is stripped the same way, and import
 *    reschedules reminders on the importing device instead.
 *  - Legacy backups without the newer optional fields still import.
 */

/* eslint-disable import/namespace -- the eslint resolver picks
   db/database.web.ts (an intentionally partial stub), so `db.*` members that
   only exist in the native db/database.ts are false-positive "not found".
   Jest itself resolves the native module. */

import { exportBackup, importBackup } from "../src/services/backup";
import { makeMedication } from "./factories";
import type { Appointment, Medication } from "../src/types";

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
  updateAppointment: jest.fn(),
  setMedicationRenewalNotifIds: jest.fn(),
}));

jest.mock("../src/services/notifications", () => ({
  scheduleAppointmentNotification: jest.fn(),
  cancelAppointmentNotification: jest.fn(),
  scheduleRenewalReminders: jest.fn(),
  cancelRenewalReminders: jest.fn(),
}));

import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/src/legacy";
import * as db from "../src/db/database";
import * as notifications from "../src/services/notifications";

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

/**
 * Every optional Appointment field set — same compile-time guard as FULL_MED:
 * a new Appointment field breaks this until appointmentSchema is revisited.
 */
const FULL_APPT: Required<Appointment> = {
  id: "appt-1",
  title: "Cardiología",
  doctor: "Dra. Pérez",
  location: "Hospital Italiano",
  locationCoords: { latitude: -34.6037, longitude: -58.3816 },
  notes: "llevar estudios previos",
  date: "2099-05-20",
  time: "09:30",
  reminderMinutes: 60,
  notificationId: "old-device-notif-1|old-device-notif-2",
  createdAt: "2026-07-01T00:00:00.000Z",
  profileId: "profile-2",
};

/** FULL_APPT as import must deliver it: without the exporting device's id. */
const { notificationId: _oldDeviceId, ...IMPORTED_APPT } = FULL_APPT;

/** FULL_MED as import must deliver it: without the exporting device's ids. */
const { renewalNotifIds: _oldDeviceRenewalIds, ...IMPORTED_MED } = FULL_MED;

/** Runs exportBackup with the given entities and returns the JSON it wrote. */
async function runExport(medications: Medication[], appointments: Appointment[] = []): Promise<string> {
  jest.mocked(db.getMedications).mockResolvedValue(medications);
  jest.mocked(db.getAllSchedules).mockResolvedValue([]);
  jest.mocked(db.getAllDoseLogs).mockResolvedValue([]);
  jest.mocked(db.getAppointments).mockResolvedValue(appointments);
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

/** Runs importBackup against the given backup JSON. `existingAppointments` /
 *  `existingMedications` are what the device already holds when the import
 *  starts (stale-reminder cancellation on "replace"). */
async function runImport(
  json: string,
  opts: {
    mode?: "replace" | "merge";
    existingAppointments?: Appointment[];
    existingMedications?: Medication[];
  } = {}
): Promise<{ count: number }> {
  const { mode = "replace", existingAppointments = [], existingMedications = [] } = opts;
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
  jest.mocked(db.getAppointments).mockResolvedValue(existingAppointments);
  jest.mocked(db.getMedications).mockResolvedValue(existingMedications);
  return importBackup(mode);
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

describe("appointment reminders across export→import", () => {
  it("exports every Appointment field as-is", async () => {
    const written = await runExport([], [FULL_APPT]);
    const parsed = JSON.parse(written);
    expect(parsed.data.appointments[0]).toEqual(FULL_APPT);
  });

  it("strips the exporting device's notificationId and reschedules on this device", async () => {
    const written = await runExport([], [FULL_APPT]);
    jest
      .mocked(notifications.scheduleAppointmentNotification)
      .mockResolvedValue("fresh-notif-1|fresh-notif-2");

    await runImport(written);

    const inserted = jest.mocked(db.insertAppointment).mock.calls[0][0];
    expect(inserted).toEqual(IMPORTED_APPT);
    expect("notificationId" in inserted).toBe(false);

    // The reminder is rebuilt here, and the fresh ids are persisted so a later
    // edit/delete can cancel them.
    expect(notifications.scheduleAppointmentNotification).toHaveBeenCalledWith(IMPORTED_APPT);
    expect(db.updateAppointment).toHaveBeenCalledWith({
      ...IMPORTED_APPT,
      notificationId: "fresh-notif-1|fresh-notif-2",
    });
  });

  it("persists nothing when no reminder could be scheduled (past date / web)", async () => {
    const written = await runExport([], [FULL_APPT]);
    jest.mocked(notifications.scheduleAppointmentNotification).mockResolvedValue(undefined);

    await runImport(written);

    expect(db.updateAppointment).not.toHaveBeenCalled();
  });

  it("replace-import cancels the reminders queued for the wiped appointments", async () => {
    const written = await runExport([], [FULL_APPT]);
    const onDevice: Appointment[] = [
      { ...FULL_APPT, id: "appt-old", notificationId: "stale-1|stale-2" },
      { ...IMPORTED_APPT, id: "appt-never-scheduled" }, // no id → nothing to cancel
    ];

    await runImport(written, { existingAppointments: onDevice });

    expect(notifications.cancelAppointmentNotification).toHaveBeenCalledTimes(1);
    expect(notifications.cancelAppointmentNotification).toHaveBeenCalledWith("stale-1|stale-2");
  });

  it("merge-import neither cancels existing reminders nor reschedules duplicates", async () => {
    const written = await runExport([], [FULL_APPT]);
    // Same id already on the device → insertAppointment rejects (duplicate).
    jest.mocked(db.insertAppointment).mockRejectedValueOnce(new Error("UNIQUE constraint"));

    await runImport(written, {
      mode: "merge",
      existingAppointments: [{ ...FULL_APPT, notificationId: "live-1" }],
    });

    expect(notifications.cancelAppointmentNotification).not.toHaveBeenCalled();
    expect(notifications.scheduleAppointmentNotification).not.toHaveBeenCalled();
    expect(db.updateAppointment).not.toHaveBeenCalled();
  });
});

describe("renewal reminders across export→import", () => {
  it("strips the exporting device's renewalNotifIds and reschedules on this device", async () => {
    const written = await runExport([FULL_MED]);
    jest
      .mocked(notifications.scheduleRenewalReminders)
      .mockResolvedValue("fresh-renewal-1|fresh-renewal-2");

    await runImport(written);

    // The renewal reminders are rebuilt here, and the fresh ids are persisted
    // so a later edit/delete can cancel them.
    expect(notifications.scheduleRenewalReminders).toHaveBeenCalledWith(IMPORTED_MED);
    expect(db.setMedicationRenewalNotifIds).toHaveBeenCalledWith(
      FULL_MED.id,
      "fresh-renewal-1|fresh-renewal-2"
    );
  });

  it("persists nothing when no reminder could be scheduled (past date / web)", async () => {
    const written = await runExport([FULL_MED]);
    jest.mocked(notifications.scheduleRenewalReminders).mockResolvedValue(undefined);

    await runImport(written);

    expect(db.setMedicationRenewalNotifIds).not.toHaveBeenCalled();
  });

  it("does not reschedule for medications without a renewalDate", async () => {
    const written = await runExport([makeMedication()]);

    await runImport(written);

    expect(notifications.scheduleRenewalReminders).not.toHaveBeenCalled();
    expect(db.setMedicationRenewalNotifIds).not.toHaveBeenCalled();
  });

  it("replace-import cancels the renewal reminders queued for the wiped medications", async () => {
    const written = await runExport([FULL_MED]);
    const staleMed = makeMedication({ id: "med-old", renewalNotifIds: "stale-1|stale-2" });
    const onDevice: Medication[] = [
      staleMed,
      makeMedication({ id: "med-never-scheduled" }), // no ids → nothing to cancel
    ];

    await runImport(written, { existingMedications: onDevice });

    expect(notifications.cancelRenewalReminders).toHaveBeenCalledTimes(1);
    expect(notifications.cancelRenewalReminders).toHaveBeenCalledWith(staleMed);
  });

  it("merge-import neither cancels existing renewal reminders nor reschedules duplicates", async () => {
    const written = await runExport([FULL_MED]);
    // Same id already on the device → insertMedication rejects (duplicate).
    jest.mocked(db.insertMedication).mockRejectedValueOnce(new Error("UNIQUE constraint"));

    await runImport(written, {
      mode: "merge",
      existingMedications: [{ ...FULL_MED, renewalNotifIds: "live-1" }],
    });

    expect(notifications.cancelRenewalReminders).not.toHaveBeenCalled();
    expect(notifications.scheduleRenewalReminders).not.toHaveBeenCalled();
    expect(db.setMedicationRenewalNotifIds).not.toHaveBeenCalled();
  });
});
