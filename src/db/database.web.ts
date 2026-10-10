/** Persistent web adapter with the same profile scoping as the native database. */
import type {
  Medication,
  Schedule,
  DoseLog,
  DoseStatus,
  Profile,
  Appointment,
  AppointmentDocument,
  Allergy,
  HealthMeasurement,
  DailyCheckin,
  MeasurementType,
} from "../types";
import {
  getActiveProfileId,
  setActiveProfileId,
  DEFAULT_PROFILE_ID,
} from "../services/profileStore";
const KEYS = {
  medications: "pilloclock:medications",
  schedules: "pilloclock:schedules",
  doseLogs: "pilloclock:dose_logs",
  profiles: "pilloclock:profiles",
  appointments: "pilloclock:appointments",
  documents: "pilloclock:documents",
  allergies: "pilloclock:allergies",
  measurements: "pilloclock:measurements",
  checkins: "pilloclock:checkins",
};
const defaultProfile = (): Profile => ({
  id: DEFAULT_PROFILE_ID,
  name: "",
  color: "blue",
  createdAt: "1970-01-01T00:00:00.000Z",
});
function load<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}
function save<T>(key: string, rows: T[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}
function insert<T extends { id: string }>(key: string, row: T) {
  const rows = load<T>(key);
  if (rows.some((r) => r.id === row.id)) throw new Error("Duplicate record");
  save(key, [...rows, row]);
}
function update<T extends { id: string }>(key: string, row: T) {
  save(
    key,
    load<T>(key).map((r) => (r.id === row.id ? row : r))
  );
}
function remove<T extends { id: string }>(key: string, id: string) {
  save(
    key,
    load<T>(key).filter((r) => r.id !== id)
  );
}
const scoped = <T extends { profileId?: string }>(rows: T[]) =>
  rows.filter(
    (r) => (r.profileId ?? DEFAULT_PROFILE_ID) === getActiveProfileId()
  );
const limitRows = <T>(rows: T[], limit: number) =>
  limit > 0 ? rows.slice(0, limit) : rows;
/** Roll back every table if any import write fails. Scheduling is disabled on web. */
export function getDb() {
  return {
    withTransactionAsync: async (fn: () => Promise<void>) => {
      const before = Object.values(KEYS).map(
        (key) => [key, localStorage.getItem(key)] as const
      );
      try {
        await fn();
      } catch (error) {
        for (const [key, value] of before) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
        throw error;
      }
    },
  };
}
export async function initDatabase() {
  const rows = load<Profile>(KEYS.profiles);
  if (!rows.some((p) => p.id === DEFAULT_PROFILE_ID))
    save(KEYS.profiles, [defaultProfile(), ...rows]);
}
export async function getProfiles(): Promise<Profile[]> {
  const rows = load<Profile>(KEYS.profiles);
  return rows.length ? rows : [defaultProfile()];
}
export async function insertProfile(profile: Profile) {
  if (!load<Profile>(KEYS.profiles).length)
    save(KEYS.profiles, [defaultProfile()]);
  insert(KEYS.profiles, profile);
}
export async function updateProfile(profile: Profile) {
  update(KEYS.profiles, profile);
}
export async function reconcileActiveProfile() {
  const profiles = await getProfiles();
  const id = profiles.some((p) => p.id === getActiveProfileId())
    ? getActiveProfileId()
    : DEFAULT_PROFILE_ID;
  setActiveProfileId(id);
  return id;
}
export async function deleteProfileData(id: string) {
  if (id === DEFAULT_PROFILE_ID)
    throw new Error("The default profile cannot be deleted");
  const appointmentIds = new Set(
    (await getAppointments()).filter((a) => a.profileId === id).map((a) => a.id)
  );
  save(
    KEYS.documents,
    (await getAllAppointmentDocuments()).filter(
      (d) => !appointmentIds.has(d.appointmentId)
    )
  );
  for (const key of [
    KEYS.appointments,
    KEYS.allergies,
    KEYS.measurements,
    KEYS.checkins,
  ])
    save(
      key,
      load<{ profileId?: string }>(key).filter((r) => r.profileId !== id)
    );
  remove<Profile>(KEYS.profiles, id);
}
export async function clearAllDataNoTx() {
  for (const key of Object.values(KEYS)) save(key, []);
  save(KEYS.profiles, [defaultProfile()]);
}
export async function clearAllData() {
  await getDb().withTransactionAsync(clearAllDataNoTx);
}
export async function getMedications() {
  return load<Medication>(KEYS.medications).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
export async function getActiveMedications() {
  return scoped(await getMedications());
}
export async function getMedicationById(id: string) {
  return (await getMedications()).find((m) => m.id === id) ?? null;
}
export async function insertMedication(m: Medication) {
  insert(KEYS.medications, {
    ...m,
    profileId: m.profileId ?? getActiveProfileId(),
  });
}
export async function updateMedication(m: Medication) {
  update(KEYS.medications, m);
}
export async function saveMedicationWithSchedules(
  med: Medication,
  schedules: Schedule[]
) {
  if (schedules.some((s) => s.medicationId !== med.id))
    throw new Error("Schedule owner mismatch");
  await getDb().withTransactionAsync(async () => {
    if (await getMedicationById(med.id)) await updateMedication(med);
    else await insertMedication(med);
    await deleteSchedulesByMedication(med.id);
    for (const schedule of schedules) await insertSchedule(schedule);
  });
}
export async function updateMedicationStock(id: string, stockQuantity: number) {
  const m = await getMedicationById(id);
  if (m) await updateMedication({ ...m, stockQuantity });
}
export async function setMedicationRenewalNotifIds(
  id: string,
  renewalNotifIds: string | undefined
) {
  const m = await getMedicationById(id);
  if (m) await updateMedication({ ...m, renewalNotifIds });
}
export async function deleteMedication(id: string) {
  remove<Medication>(KEYS.medications, id);
  await deleteSchedulesByMedication(id);
}
export async function getAllSchedules() {
  return load<Schedule>(KEYS.schedules);
}
export async function getAllActiveSchedules() {
  const meds = new Set(
    (await getMedications()).filter((m) => m.isActive).map((m) => m.id)
  );
  return (await getAllSchedules()).filter(
    (s) => s.isActive && meds.has(s.medicationId)
  );
}
export async function getSchedulesByMedication(id: string) {
  return (await getAllSchedules()).filter((s) => s.medicationId === id);
}
export async function insertSchedule(s: Schedule) {
  insert(KEYS.schedules, s);
}
export async function updateSchedule(s: Schedule) {
  update(KEYS.schedules, s);
}
export async function deleteSchedule(id: string) {
  remove<Schedule>(KEYS.schedules, id);
}
export async function deleteSchedulesByMedication(id: string) {
  save(
    KEYS.schedules,
    (await getAllSchedules()).filter((s) => s.medicationId !== id)
  );
}
export async function getAllDoseLogs() {
  return load<DoseLog>(KEYS.doseLogs).sort(
    (a, b) =>
      b.scheduledDate.localeCompare(a.scheduledDate) ||
      b.scheduledTime.localeCompare(a.scheduledTime)
  );
}
export async function getDoseLogsByDate(date: string) {
  return (await getAllDoseLogs()).filter((l) => l.scheduledDate === date);
}
export async function getDoseLogsByDateRange(from: string, to: string) {
  return (await getAllDoseLogs()).filter(
    (l) => l.scheduledDate >= from && l.scheduledDate <= to
  );
}
export async function getDoseLogByScheduleAndDate(id: string, date: string) {
  return (
    (await getAllDoseLogs()).find(
      (l) => l.scheduleId === id && l.scheduledDate === date
    ) ?? null
  );
}
export async function upsertDoseLog(log: DoseLog) {
  const rows = await getAllDoseLogs();
  save(KEYS.doseLogs, [
    ...rows.filter(
      (l) =>
        !(
          l.scheduleId === log.scheduleId &&
          l.scheduledDate === log.scheduledDate
        )
    ),
    log,
  ]);
}
export const upsertDoseLogNoTx = upsertDoseLog;
export async function saveDoseLogWithStock(
  log: DoseLog,
  stockQuantity?: number
) {
  await getDb().withTransactionAsync(async () => {
    await upsertDoseLog(log);
    if (stockQuantity !== undefined)
      await updateMedicationStock(log.medicationId, stockQuantity);
  });
}
export async function removeDoseLogWithStock(
  scheduleId: string,
  date: string,
  medicationId: string,
  stockQuantity?: number
) {
  await getDb().withTransactionAsync(async () => {
    await deleteDoseLog(scheduleId, date);
    if (stockQuantity !== undefined)
      await updateMedicationStock(medicationId, stockQuantity);
  });
}
export async function insertMissedDoseLogSafe(log: DoseLog) {
  if (!(await getDoseLogByScheduleAndDate(log.scheduleId, log.scheduledDate)))
    await upsertDoseLog(log);
}
export async function updateDoseLogStatus(
  id: string,
  date: string,
  status: DoseStatus,
  takenAt?: string
) {
  const l = await getDoseLogByScheduleAndDate(id, date);
  if (l) await upsertDoseLog({ ...l, status, takenAt });
}
export async function deleteDoseLog(id: string, date: string) {
  save(
    KEYS.doseLogs,
    (await getAllDoseLogs()).filter(
      (l) => !(l.scheduleId === id && l.scheduledDate === date)
    )
  );
}
export async function updateDoseLogNotes(
  id: string,
  date: string,
  notes: string
) {
  const l = await getDoseLogByScheduleAndDate(id, date);
  if (l) await upsertDoseLog({ ...l, notes });
}
export async function setDoseInjectionSite(
  id: string,
  date: string,
  injectionSite: string
) {
  const l = await getDoseLogByScheduleAndDate(id, date);
  if (l) await upsertDoseLog({ ...l, injectionSite });
}
export async function getAppointments() {
  return load<Appointment>(KEYS.appointments).sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
  );
}
export async function getActiveAppointments() {
  return scoped(await getAppointments());
}
export async function insertAppointment(a: Appointment) {
  insert(KEYS.appointments, {
    ...a,
    profileId: a.profileId ?? getActiveProfileId(),
  });
}
export async function updateAppointment(a: Appointment) {
  update(KEYS.appointments, a);
}
export async function deleteAppointment(id: string) {
  remove<Appointment>(KEYS.appointments, id);
  save(
    KEYS.documents,
    (await getAllAppointmentDocuments()).filter((d) => d.appointmentId !== id)
  );
}
export async function getAllAppointmentDocuments() {
  return load<AppointmentDocument>(KEYS.documents);
}
export async function getAppointmentDocuments(id: string) {
  return (await getAllAppointmentDocuments()).filter(
    (d) => d.appointmentId === id
  );
}
export async function insertAppointmentDocument(d: AppointmentDocument) {
  insert(KEYS.documents, d);
}
export async function deleteAppointmentDocument(id: string) {
  remove<AppointmentDocument>(KEYS.documents, id);
}
export async function getAllAllergies() {
  return load<Allergy>(KEYS.allergies);
}
export async function getActiveAllergies() {
  return scoped(await getAllAllergies());
}
export async function insertAllergy(a: Allergy) {
  insert(KEYS.allergies, {
    ...a,
    profileId: a.profileId ?? getActiveProfileId(),
  });
}
export async function deleteAllergy(id: string) {
  remove<Allergy>(KEYS.allergies, id);
}
export async function updateAllergy(allergy: Allergy) {
  const existing = (await getActiveAllergies()).find(
    (a) => a.id === allergy.id
  );
  if (existing)
    update(KEYS.allergies, {
      ...existing,
      name: allergy.name,
      ingRxcui: allergy.ingRxcui,
    });
}
export async function getAllHealthMeasurements() {
  return load<HealthMeasurement>(KEYS.measurements).sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt)
  );
}
export async function getHealthMeasurements(
  type?: MeasurementType,
  limit = 60
) {
  return limitRows(
    (await getAllHealthMeasurements()).filter((m) => !type || m.type === type),
    limit
  );
}
export async function getActiveHealthMeasurements(
  type?: MeasurementType,
  limit = 60
) {
  return limitRows(
    scoped(await getAllHealthMeasurements()).filter(
      (m) => !type || m.type === type
    ),
    limit
  );
}
export async function insertHealthMeasurement(m: HealthMeasurement) {
  insert(KEYS.measurements, {
    ...m,
    profileId: m.profileId ?? getActiveProfileId(),
  });
}
export async function deleteHealthMeasurement(id: string) {
  remove<HealthMeasurement>(KEYS.measurements, id);
}
export async function updateHealthMeasurement(m: HealthMeasurement) {
  const existing = scoped(await getAllHealthMeasurements()).find(
    (r) => r.id === m.id
  );
  if (existing)
    update(KEYS.measurements, {
      ...existing,
      type: m.type,
      value1: m.value1,
      value2: m.value2,
      measuredAt: m.measuredAt,
      notes: m.notes,
    });
}
export async function getAllDailyCheckins() {
  return load<DailyCheckin>(KEYS.checkins).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}
export async function getDailyCheckins(from?: string, to?: string) {
  const rows = await getAllDailyCheckins();
  return from && to
    ? rows.filter((c) => c.date >= from && c.date <= to)
    : rows.slice(0, 90);
}
export async function getActiveDailyCheckins(
  from?: string,
  to?: string,
  limit = 90
) {
  const rows = scoped(await getAllDailyCheckins());
  return from && to
    ? rows.filter((c) => c.date >= from && c.date <= to)
    : limitRows(rows, limit);
}
export async function getDailyCheckinByDate(date: string) {
  return (
    (await getActiveDailyCheckins(undefined, undefined, 0)).find(
      (c) => c.date === date
    ) ?? null
  );
}
export async function upsertDailyCheckin(checkin: DailyCheckin) {
  const c = {
    ...checkin,
    profileId: checkin.profileId ?? getActiveProfileId(),
  };
  save(KEYS.checkins, [
    ...(await getAllDailyCheckins()).filter(
      (r) =>
        !(
          (r.profileId ?? DEFAULT_PROFILE_ID) === c.profileId &&
          r.date === c.date
        )
    ),
    c,
  ]);
}
