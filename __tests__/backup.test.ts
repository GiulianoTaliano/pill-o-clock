import { Platform } from "react-native";
import { File, Directory } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import { StorageAccessFramework } from "expo-file-system/src/legacy";
import { exportBackup, importBackup, planBackupMerge, BackupCancelledError, BackupFormatError, type BackupData } from "../src/services/backup";
import * as db from "../src/db/database";
import * as notifications from "../src/services/notifications";
import { makeMedication, makeDoseLog } from "./factories";
import type { Medication, Appointment } from "../src/types";

jest.mock("expo-file-system", () => ({ File: jest.fn(), Directory: jest.fn(), Paths: { document: "file:///documents", cache: "file:///cache" } }));
jest.mock("expo-file-system/src/legacy", () => ({ StorageAccessFramework: { requestDirectoryPermissionsAsync: jest.fn(), createFileAsync: jest.fn(), writeAsStringAsync: jest.fn() } }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("../src/db/database", () => Object.fromEntries([
  "getDb", "getMedications", "getAllSchedules", "getAllDoseLogs", "getAppointments", "getAllAppointmentDocuments", "getAllHealthMeasurements", "getAllDailyCheckins", "getProfiles", "getAllAllergies",
  "clearAllData", "clearAllDataNoTx", "insertMedication", "insertSchedule", "upsertDoseLogNoTx", "insertAppointment", "insertAppointmentDocument", "insertHealthMeasurement", "upsertDailyCheckin", "insertProfile", "updateProfile", "reconcileActiveProfile", "insertAllergy", "updateAppointment", "setMedicationRenewalNotifIds",
].map(key => [key, jest.fn()])));
jest.mock("../src/services/notifications", () => Object.fromEntries([
  "scheduleAppointmentNotification", "cancelAppointmentNotification", "scheduleRenewalReminders", "cancelRenewalReminders", "cancelScheduleNotifications", "rebuildDoseNotifications",
].map(key => [key, jest.fn()])));

const FULL_MED: Required<Medication> = {
  ...makeMedication(), notes: "tomar con comida", startDate: "2026-01-01", endDate: "2026-12-31", stockQuantity: 30, stockAlertThreshold: 5,
  photoUri: "file:///photos/med-1.jpg", isPRN: true, renewalDate: "2099-08-15", renewalNotifIds: "old-renewal", prnMaxPerDay: 4,
  prnMinIntervalMinutes: 360, rxcui: "1049221", profileId: "profile-2", regimen: '{"type":"everyN","intervalDays":2}',
  isInjectable: true, archivedAt: "2026-07-01T00:00:00.000Z", archiveReason: "doctor",
};
const FULL_APPT: Required<Appointment> = {
  id: "appt-1", title: "Cardiología", doctor: "Dra. Pérez", location: "Hospital", locationCoords: { latitude: -34.6, longitude: -58.3 },
  notes: "estudios", date: "2099-05-20", time: "09:30", reminderMinutes: 60, notificationId: "old-appointment",
  createdAt: "2026-07-01T00:00:00.000Z", profileId: "profile-2",
};
const profiles = [
  { id: "default", name: "Owner", color: "blue", createdAt: "2026-01-01", emergencyContactName: "Ana", emergencyContactPhone: "+541123456789" },
  { id: "profile-2", name: "Daughter", color: "pink", createdAt: "2026-01-01" },
];
let input = "";
let output = "";
let files: { uri: string; create: jest.Mock; write: jest.Mock; delete: jest.Mock; base64: jest.Mock }[] = [];
const empty = (): BackupData["data"] => ({ profiles: [], medications: [], schedules: [], doseLogs: [], appointments: [], appointmentDocuments: [], healthMeasurements: [], dailyCheckins: [], allergies: [] });
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  files = []; output = ""; input = "";
  for (const read of [db.getMedications, db.getAllSchedules, db.getAllDoseLogs, db.getAppointments, db.getAllAppointmentDocuments, db.getAllHealthMeasurements, db.getAllDailyCheckins, db.getAllAllergies]) jest.mocked(read).mockResolvedValue([] as never);
  jest.mocked(db.getProfiles).mockResolvedValue(profiles);
  jest.mocked(db.getDb).mockReturnValue({ withTransactionAsync: (fn: () => Promise<void>) => fn() } as never);
  (Directory as unknown as jest.Mock).mockImplementation(() => ({ create: jest.fn() }));
  (File as unknown as jest.Mock).mockImplementation((path: string, filename?: string) => {
    const file = { uri: filename ? "file:///restored/" + filename : path, exists: true, text: async () => input, base64: jest.fn(async () => "cG9ydGFibGU="), create: jest.fn(), write: jest.fn(), delete: jest.fn() };
    files.push(file); return file;
  });
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///picked.json" }] } as never);
  jest.mocked(StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValue({ granted: true, directoryUri: "content://backups" } as never);
  jest.mocked(StorageAccessFramework.createFileAsync).mockResolvedValue("content://backups/file");
  jest.mocked(StorageAccessFramework.writeAsStringAsync).mockImplementation(async (_uri, contents) => { output = contents; });
});
const exportFixture = async (medications: Medication[] = [], appointments: Appointment[] = []) => {
  jest.mocked(db.getMedications).mockResolvedValue(medications);
  jest.mocked(db.getAppointments).mockResolvedValue(appointments);
  await exportBackup();
  input = output;
  return JSON.parse(output) as BackupData;
};
const resetExisting = () => {
  jest.mocked(db.getMedications).mockResolvedValue([]);
  jest.mocked(db.getAppointments).mockResolvedValue([]);
  jest.mocked(db.getAllAppointmentDocuments).mockResolvedValue([]);
  jest.mocked(db.getAllDoseLogs).mockResolvedValue([]);
};
const legacy = (data: Partial<BackupData["data"]>) => JSON.stringify({ version: 1, app: "pill-o-clock", exportedAt: "2026-01-01", data: { medications: [], ...data } });

describe("complete portable backup", () => {
  it("exports every medication field, embeds bytes and remaps the photo on restore", async () => {
    const backup = await exportFixture([FULL_MED]);
    expect(backup.version).toBe(4);
    expect(backup.data.medications[0]).toEqual(FULL_MED);
    expect(backup.attachments[0]).toMatchObject({ kind: "photo", ownerId: FULL_MED.id, base64: "cG9ydGFibGU=" });
    resetExisting();
    const result = await importBackup("replace");
    expect(result.count).toBe(1);
    const imported = jest.mocked(db.insertMedication).mock.calls[0][0];
    const { renewalNotifIds: _deviceOnly, photoUri: _oldPhoto, ...expected } = FULL_MED;
    expect(imported).toMatchObject(expected);
    expect(imported).not.toHaveProperty("renewalNotifIds");
    expect(imported.photoUri?.startsWith("file:///restored/")).toBe(true);
    expect(files.find(f => f.uri === imported.photoUri)?.write).toHaveBeenCalledWith("cG9ydGFibGU=", { encoding: "base64" });
  });
  it("exports all measurements and diary rows across people beyond UI limits", async () => {
    const measurements = Array.from({ length: 130 }, (_, i) => ({ id: "h" + i, type: "weight" as const, value1: 70, measuredAt: "2026-01-01", createdAt: "2026-01-01", profileId: i % 2 ? "default" : "profile-2" }));
    const checkins = Array.from({ length: 140 }, (_, i) => ({ id: "c" + i, date: "2026-01-" + i, mood: 3 as const, symptoms: [], createdAt: "2026-01-01", profileId: "default" }));
    jest.mocked(db.getAllHealthMeasurements).mockResolvedValue(measurements);
    jest.mocked(db.getAllDailyCheckins).mockResolvedValue(checkins);
    const backup = await exportFixture();
    expect(backup.data.healthMeasurements).toEqual(measurements);
    expect(backup.data.dailyCheckins).toEqual(checkins);
  });
  it("round-trips document bytes, injection site, stock delta, and default emergency contact", async () => {
    const log = makeDoseLog({ injectionSite: "abdomen_l", stockDelta: 0.5 });
    jest.mocked(db.getAllDoseLogs).mockResolvedValue([log]);
    jest.mocked(db.getAllAppointmentDocuments).mockResolvedValue([{ id: "doc", appointmentId: FULL_APPT.id, fileName: "analysis.pdf", mimeType: "application/pdf", fileUri: "file:///old.pdf", createdAt: "2026-01-01" }]);
    await exportFixture([], [FULL_APPT]); resetExisting();
    const result = await importBackup("replace");
    expect(db.upsertDoseLogNoTx).toHaveBeenCalledWith(log);
    expect(db.updateProfile).toHaveBeenCalledWith(profiles[0]);
    expect(db.insertProfile).toHaveBeenCalledWith(profiles[1]);
    expect(jest.mocked(db.insertAppointmentDocument).mock.calls[0][0].fileUri).toMatch(/restored.*\.pdf$/);
    expect(result.inserted.doseLogs).toBe(1);
    expect(db.reconcileActiveProfile).toHaveBeenCalledTimes(1);
  });
  it("still writes the records when a referenced file cannot be read, and reports it", async () => {
    (File as unknown as jest.Mock).mockImplementation(() => ({ text: async () => input, base64: async () => { throw new Error("missing"); } }));
    jest.mocked(db.getMedications).mockResolvedValue([FULL_MED]);
    jest.mocked(db.getAllAppointmentDocuments).mockResolvedValue([{ id: "doc", appointmentId: FULL_APPT.id, fileName: "analysis.pdf", mimeType: "application/pdf", fileUri: "file:///gone.pdf", createdAt: "2026-01-01" }]);
    await expect(exportBackup()).resolves.toEqual({ missingAttachments: 2 });
    const written = JSON.parse(output) as BackupData;
    expect(written.data.medications[0].photoUri).toBeUndefined();
    expect(written.data.appointmentDocuments).toEqual([]);
    expect(written.attachments).toEqual([]);
    // The partial copy stays importable: v4 never references bytes it lacks.
    input = output; resetExisting();
    await expect(importBackup("replace")).resolves.toMatchObject({ count: 1 });
  });
  it("merge keeps the current schedules of a medication that already exists", async () => {
    const med = makeMedication();
    const backup = { ...empty(), medications: [med], schedules: [{ id: "old-evening", medicationId: med.id, time: "20:00", days: [], isActive: true }] };
    const { selected, conflicts } = planBackupMerge(backup, { ...empty(), profiles, medications: [med] });
    expect(selected.schedules).toEqual([]);
    expect(conflicts.schedules).toBe(1);
  });
  it("replace accepts allergies whose names differ only in case", async () => {
    input = JSON.stringify({ version: 4, exportedAt: "2026-01-01", app: "pill-o-clock", attachments: [], data: { ...empty(), profiles, allergies: [
      { id: "a1", name: "Penicilina", createdAt: "2026-01-01", profileId: "default" },
      { id: "a2", name: "penicilina", createdAt: "2026-01-01", profileId: "default" },
    ] } });
    await expect(importBackup("replace")).resolves.toBeDefined();
    expect(db.insertAllergy).toHaveBeenCalledTimes(2);
  });
  it("keeps legacy records and assigns unscoped data to the main person", async () => {
    input = legacy({ medications: [makeMedication()] });
    const result = await importBackup("replace");
    expect(result.count).toBe(1);
    expect(db.insertMedication).toHaveBeenCalledWith({ ...makeMedication(), profileId: "default" });
  });
  it("surfaces legacy attachment limits instead of claiming portable bytes", async () => {
    input = legacy({ medications: [makeMedication({ photoUri: "file:///old.jpg" })] });
    const confirm = jest.fn(async () => "merge" as const);
    const result = await importBackup("merge", undefined, confirm);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ missingAttachments: 1 }));
    expect(result.missingAttachments).toBe(1);
  });
});

describe("restore preview and conflicts", () => {
  it("restores the main person's identity into a fresh placeholder but preserves a populated main profile", () => {
    const incoming = { ...empty(), profiles: [profiles[0]] };
    const fresh = { ...empty(), profiles: [{ id: "default", name: "", color: "blue", createdAt: "now" }] };
    expect(planBackupMerge(incoming, fresh).selected.profiles).toEqual([profiles[0]]);
    expect(planBackupMerge(incoming, { ...fresh, medications: [makeMedication()] }).selected.profiles).toEqual([]);
  });
  it("cancelling preview touches neither data, files nor reminders", async () => {
    await exportFixture([FULL_MED]); resetExisting(); files = [];
    await expect(importBackup("replace", undefined, async () => null)).rejects.toBeInstanceOf(BackupCancelledError);
    expect(db.clearAllData).not.toHaveBeenCalled();
    expect(db.insertMedication).not.toHaveBeenCalled();
    expect(Directory).not.toHaveBeenCalled();
    expect(notifications.rebuildDoseNotifications).not.toHaveBeenCalled();
    expect(files[0].delete).toHaveBeenCalled();
  });
  it("merge preserves existing medication, dose status, diary and normalized allergy", () => {
    const existing = { ...empty(), medications: [makeMedication({ name: "Current" })], doseLogs: [makeDoseLog({ status: "taken" })], dailyCheckins: [{ id: "c1", date: "2026-01-01", mood: 3, symptoms: [], createdAt: "2026", profileId: "default" }], allergies: [{ id: "a1", name: "Penicillin", createdAt: "2026", profileId: "default" }] } as BackupData["data"];
    const incoming = { ...empty(), medications: [makeMedication({ name: "Old" })], doseLogs: [makeDoseLog({ id: "other-log", status: "missed" })], dailyCheckins: [{ ...existing.dailyCheckins[0], id: "c2", mood: 1 }], allergies: [{ ...existing.allergies[0], id: "a2", name: " penicillin " }] };
    const plan = planBackupMerge(incoming, existing);
    expect(plan.selected.medications).toEqual([]);
    expect(plan.selected.doseLogs).toEqual([]);
    expect(plan.selected.dailyCheckins).toEqual([]);
    expect(plan.selected.allergies).toEqual([]);
    expect(plan.conflicts).toMatchObject({ medications: 1, doseLogs: 1, dailyCheckins: 1, allergies: 1 });
  });
  it("merge totals count inserted records and skips known IDs before insertion", async () => {
    input = legacy({ medications: [makeMedication(), makeMedication({ id: "new" })] });
    jest.mocked(db.getMedications).mockResolvedValue([makeMedication({ name: "Current" })]);
    const result = await importBackup("merge");
    expect(result.count).toBe(1);
    expect(result.skipped.medications).toBe(1);
    expect(db.insertMedication).toHaveBeenCalledTimes(1);
    expect(jest.mocked(db.insertMedication).mock.calls[0][0].id).toBe("new");
    expect(notifications.cancelScheduleNotifications).not.toHaveBeenCalled();
  });
  it("rejects duplicate replacement rows instead of overwriting silently", async () => {
    input = legacy({ doseLogs: [makeDoseLog(), makeDoseLog({ id: "different" })] });
    await expect(importBackup("replace")).rejects.toBeInstanceOf(BackupFormatError);
    expect(db.clearAllData).not.toHaveBeenCalled();
  });
  it("rejects unknown profile and missing portable bytes before changing data", async () => {
    input = legacy({ medications: [makeMedication({ profileId: "unknown" })] });
    await expect(importBackup("replace")).rejects.toBeInstanceOf(BackupFormatError);
    input = JSON.stringify({ version: 4, exportedAt: "2026", app: "pill-o-clock", data: { medications: [makeMedication({ photoUri: "file:///missing.jpg" })] } });
    await expect(importBackup("replace")).rejects.toBeInstanceOf(BackupFormatError);
    expect(db.clearAllData).not.toHaveBeenCalled();
  });
  it("write failure propagates, removes only new assets and does not alter live reminders", async () => {
    await exportFixture([FULL_MED]); resetExisting(); files = [];
    jest.mocked(db.insertMedication).mockRejectedValueOnce(new Error("disk full"));
    await expect(importBackup("replace")).rejects.toThrow("disk full");
    expect(files.filter(f => f.uri.startsWith("file:///restored/")).every(f => f.delete.mock.calls.length === 1)).toBe(true);
    expect(db.reconcileActiveProfile).not.toHaveBeenCalled();
    expect(notifications.rebuildDoseNotifications).not.toHaveBeenCalled();
  });
});

describe("reminders after data commit", () => {
  it("replaces old appointment IDs and renewals with IDs from this device", async () => {
    await exportFixture([FULL_MED], [FULL_APPT]); resetExisting();
    jest.mocked(notifications.scheduleAppointmentNotification).mockResolvedValue("fresh-appointment");
    jest.mocked(notifications.scheduleRenewalReminders).mockResolvedValue("fresh-renewal");
    await importBackup("replace");
    const appt = jest.mocked(db.insertAppointment).mock.calls[0][0];
    expect(appt).not.toHaveProperty("notificationId");
    expect(db.updateAppointment).toHaveBeenCalledWith({ ...appt, notificationId: "fresh-appointment" });
    expect(db.setMedicationRenewalNotifIds).toHaveBeenCalledWith(FULL_MED.id, "fresh-renewal");
    expect(notifications.rebuildDoseNotifications).toHaveBeenCalledTimes(1);
  });
  it("reports notification failure after a successful restore without losing data", async () => {
    input = legacy({ medications: [makeMedication()] });
    jest.mocked(notifications.rebuildDoseNotifications).mockRejectedValueOnce(new Error("permission"));
    const result = await importBackup("replace");
    expect(result.count).toBe(1);
    expect(result.reminderErrors).toBe(1);
    expect(db.reconcileActiveProfile).toHaveBeenCalled();
  });
  it("does not cancel or reschedule duplicate appointments on merge", async () => {
    await exportFixture([], [FULL_APPT]);
    const result = await importBackup("merge");
    expect(result.skipped.appointments).toBe(1);
    expect(notifications.scheduleAppointmentNotification).not.toHaveBeenCalled();
    expect(notifications.cancelAppointmentNotification).not.toHaveBeenCalled();
  });
});
