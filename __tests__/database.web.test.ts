import * as db from "../src/db/database.web";
import { setActiveProfileId } from "../src/services/profileStore";
import { makeMedication, makeSchedule, makeDoseLog } from "./factories";
let values: Map<string, string>;
let failKey: string | null;
beforeEach(async () => {
  values = new Map(); failKey = null;
  Object.defineProperty(global, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (key === failKey) { failKey = null; throw new Error("disk full"); } values.set(key, value); },
    removeItem: (key: string) => values.delete(key),
  } });
  setActiveProfileId("default"); await db.initDatabase();
});
describe("persistent web database parity", () => {
  it("keeps complete dose facts, including injection site and actual stock effect", async () => {
    await db.insertMedication(makeMedication({ stockQuantity: 8 }));
    const log = makeDoseLog({ injectionSite: "abdomen_l", stockDelta: 1 });
    await db.saveDoseLogWithStock(log, 7);
    expect(await db.getDoseLogByScheduleAndDate(log.scheduleId, log.scheduledDate)).toEqual(log);
    expect((await db.getMedicationById(log.medicationId))?.stockQuantity).toBe(7);
    await db.removeDoseLogWithStock(log.scheduleId, log.scheduledDate, log.medicationId, 8);
    expect(await db.getAllDoseLogs()).toEqual([]);
    expect((await db.getMedicationById(log.medicationId))?.stockQuantity).toBe(8);
  });
  it("rolls back the dose if inventory persistence fails", async () => {
    await db.insertMedication(makeMedication({ stockQuantity: 8 }));
    failKey = "pilloclock:medications";
    await expect(db.saveDoseLogWithStock(makeDoseLog(), 7)).rejects.toThrow("disk full");
    expect(await db.getAllDoseLogs()).toEqual([]);
    expect((await db.getMedicationById("med-1"))?.stockQuantity).toBe(8);
  });
  it("rolls back the undo if inventory persistence fails", async () => {
    await db.insertMedication(makeMedication({ stockQuantity: 7 }));
    const log = makeDoseLog({ stockDelta: 1 }); await db.upsertDoseLog(log);
    failKey = "pilloclock:medications";
    await expect(db.removeDoseLogWithStock(log.scheduleId, log.scheduledDate, log.medicationId, 8)).rejects.toThrow("disk full");
    expect(await db.getAllDoseLogs()).toEqual([log]);
    expect((await db.getMedicationById("med-1"))?.stockQuantity).toBe(7);
  });
  it("saves medication with schedules atomically and preserves historical logs", async () => {
    await db.insertMedication(makeMedication());
    await db.insertSchedule(makeSchedule());
    const log = makeDoseLog(); await db.upsertDoseLog(log);
    await db.saveMedicationWithSchedules(makeMedication({ name: "Edited" }), [makeSchedule({ id: "new" })]);
    expect((await db.getSchedulesByMedication("med-1")).map(s => s.id)).toEqual(["new"]);
    expect(await db.getAllDoseLogs()).toEqual([log]);
    failKey = "pilloclock:schedules";
    await expect(db.saveMedicationWithSchedules(makeMedication({ name: "Failed" }), [])).rejects.toThrow("disk full");
    expect((await db.getMedicationById("med-1"))?.name).toBe("Edited");
    expect((await db.getSchedulesByMedication("med-1")).map(s => s.id)).toEqual(["new"]);
  });
  it("stores appointments, documents and allergies with profile scoping", async () => {
    await db.insertProfile({ id: "other", name: "Other", color: "pink", createdAt: "2026" });
    await db.insertAppointment({ id: "a", title: "Owner", date: "2026-01-01", createdAt: "2026" });
    await db.insertAppointmentDocument({ id: "d", appointmentId: "a", fileName: "x.pdf", fileUri: "file:///x.pdf", mimeType: "application/pdf", createdAt: "2026" });
    await db.insertAllergy({ id: "al", name: "Owner allergy", createdAt: "2026" });
    setActiveProfileId("other");
    expect(await db.getActiveAppointments()).toEqual([]);
    expect(await db.getActiveAllergies()).toEqual([]);
    await db.updateAllergy({ id: "al", name: "Wrong owner", createdAt: "2026" });
    expect((await db.getAllAllergies())[0].name).toBe("Owner allergy");
    expect(await db.getAllAppointmentDocuments()).toHaveLength(1);
  });
  it("complete getters have no UI limit, while active getters never expose other people", async () => {
    for (let i = 0; i < 150; i++) {
      const profileId = i % 2 ? "other" : "default";
      await db.insertHealthMeasurement({ id: "m" + i, type: "weight", value1: 70, measuredAt: "2026-01-01", createdAt: "2026", profileId });
      await db.upsertDailyCheckin({ id: "c" + i, date: "2026-" + i, mood: 3, symptoms: [], createdAt: "2026", profileId });
    }
    expect(await db.getAllHealthMeasurements()).toHaveLength(150);
    expect(await db.getAllDailyCheckins()).toHaveLength(150);
    expect(await db.getActiveHealthMeasurements(undefined, 0)).toHaveLength(75);
    expect(await db.getActiveDailyCheckins(undefined, undefined, 0)).toHaveLength(75);
    expect(await db.getActiveHealthMeasurements()).toHaveLength(60);
  });
  it("editing measurements keeps their owner and original creation time", async () => {
    const m = { id: "m", type: "weight" as const, value1: 70, measuredAt: "2026", createdAt: "original", profileId: "default" };
    await db.insertHealthMeasurement(m);
    await db.updateHealthMeasurement({ ...m, value1: 72, profileId: "other", createdAt: "changed" });
    expect((await db.getAllHealthMeasurements())[0]).toMatchObject({ value1: 72, createdAt: "original", profileId: "default" });
    setActiveProfileId("other"); await db.updateHealthMeasurement({ ...m, value1: 99 });
    expect((await db.getAllHealthMeasurements())[0].value1).toBe(72);
  });
  it("reset clears the main person's personal data and reconciles a deleted selection", async () => {
    await db.updateProfile({ id: "default", name: "Private", color: "pink", createdAt: "2026", emergencyContactPhone: "12345" });
    await db.insertProfile({ id: "other", name: "Other", color: "pink", createdAt: "2026" });
    setActiveProfileId("other");
    await db.clearAllData();
    expect(await db.reconcileActiveProfile()).toBe("default");
    const profiles = await db.getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("");
    expect(profiles[0].emergencyContactPhone).toBeUndefined();
  });
  it("failed reset restores the original rows and main-person attributes", async () => {
    await db.insertMedication(makeMedication());
    await db.updateProfile({ id: "default", name: "Private", color: "blue", createdAt: "2026" });
    failKey = "pilloclock:profiles";
    await expect(db.clearAllData()).rejects.toThrow("disk full");
    expect(await db.getMedications()).toHaveLength(1);
    expect((await db.getProfiles())[0].name).toBe("Private");
  });
});
