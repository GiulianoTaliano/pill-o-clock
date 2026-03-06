import { create } from "zustand";
import { addDays, addMinutes, format, startOfDay } from "date-fns";
import { Appearance, LayoutAnimation, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Medication, Schedule, DoseLog, TodayDose, Appointment, HealthMeasurement, MeasurementType, DailyCheckin } from "../types";
import {
  getMedications,
  getSchedulesByMedication,
  getAllActiveSchedules,
  insertMedication,
  updateMedication,
  deleteMedication,
  insertSchedule,
  deleteSchedule,
  getDoseLogsByDate,
  getDoseLogsByDateRange,
  upsertDoseLog,
  deleteDoseLog,
  clearAllData,
  getAppointments,
  insertAppointment,
  updateAppointment as updateAppointmentDb,
  deleteAppointment as deleteAppointmentDb,
  updateMedicationStock,
  updateDoseLogNotes,
  getHealthMeasurements,
  insertHealthMeasurement,
  deleteHealthMeasurement as deleteHealthMeasurementDb,
  getDailyCheckins,
  upsertDailyCheckin,
} from "../db/database";
import {
  generateId,
  today,
  toISOString,
  toDateString,
  isScheduleActiveOnDate,
} from "../utils";
import {
  scheduleDoseChain,
  cancelDoseNotifications,
  cancelScheduleNotifications,
  cancelAllNotifications,
  snoozeDose,
  SNOOZE_MINUTES,
  scheduleStockAlert,
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
} from "../services/notifications";
import { unregisterBackgroundFetch } from "../services/backgroundTask";

// ─── State ─────────────────────────────────────────────────────────────────

export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "@pilloclock/theme_mode";

interface AppState {
  medications: Medication[];
  schedules: Schedule[];  // all schedules in memory
  todayLogs: DoseLog[];
  appointments: Appointment[];
  /** In-memory map of "scheduleId-date" → "HH:mm" for snoozed-but-not-yet-due doses. */
  snoozedTimes: Record<string, string>;
  isLoading: boolean;
  themeMode: ThemeMode;

  // Actions
  loadAll: () => Promise<void>;
  loadThemeMode: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  loadTodayLogs: () => Promise<void>;

  addMedication: (
    data: Omit<Medication, "id" | "createdAt" | "isActive">,
    scheduleInputs: Omit<Schedule, "id" | "medicationId" | "isActive">[]
  ) => Promise<Medication>;

  updateMedication: (
    med: Medication,
    scheduleInputs: Omit<Schedule, "id" | "medicationId" | "isActive">[]
  ) => Promise<void>;

  deleteMedication: (id: string) => Promise<void>;

  toggleMedicationActive: (id: string, isActive: boolean) => Promise<void>;

  markDose: (
    dose: TodayDose,
    status: "taken" | "skipped",
    notes?: string
  ) => Promise<void>;

  /** Update the free-text note on an already-logged dose. */
  updateDoseNote: (scheduleId: string, scheduledDate: string, notes: string) => Promise<void>;

  snoozeDose: (dose: TodayDose) => Promise<void>;

  /** Reschedule a single dose to a specific time today (one-off, does not affect other days). */
  rescheduleOnce: (dose: TodayDose, newTime: string) => Promise<void>;

  /** Remove a taken/skipped log so the dose can be re-marked. */
  revertDose: (dose: TodayDose) => Promise<void>;

  /** Undo a pending snooze, restoring the original notification schedule. */
  revertSnooze: (dose: TodayDose) => Promise<void>;

  getHistoryLogs: (from: string, to: string) => Promise<DoseLog[]>;

  getSchedulesForMedication: (medicationId: string) => Schedule[];

  /** Wipes all DB rows and cancels all scheduled notifications. */
  resetAllData: () => Promise<void>;

  // ── Appointments ─────────────────────────────────────────────────
  loadAppointments: () => Promise<void>;
  addAppointment: (data: Omit<Appointment, "id" | "createdAt" | "notificationId">) => Promise<void>;
  updateAppointment: (appt: Omit<Appointment, "notificationId">) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  // ── Health measurements ───────────────────────────────────────────
  healthMeasurements: HealthMeasurement[];
  loadHealthMeasurements: (type?: MeasurementType) => Promise<void>;
  addHealthMeasurement: (data: Omit<HealthMeasurement, 'id' | 'createdAt'>) => Promise<void>;
  deleteHealthMeasurement: (id: string) => Promise<void>;

  // ── Daily check-ins ──────────────────────────────────────────────────
  dailyCheckins: DailyCheckin[];
  loadDailyCheckins: () => Promise<void>;
  saveDailyCheckin: (data: Omit<DailyCheckin, 'id' | 'createdAt'>) => Promise<void>;}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  medications: [],
  schedules: [],
  todayLogs: [],
  appointments: [],
  healthMeasurements: [],
  dailyCheckins: [],
  snoozedTimes: {},
  isLoading: false,
  themeMode: "system",

  // ── Theme ─────────────────────────────────────────────────────────────

  async loadThemeMode() {
    const saved = (await AsyncStorage.getItem(THEME_KEY)) as ThemeMode | null;
    const mode: ThemeMode = saved ?? "system";
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(mode === "system" ? null : mode);
    }
    set({ themeMode: mode });
  },

  async setThemeMode(mode) {
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(mode === "system" ? null : mode);
    }
    await AsyncStorage.setItem(THEME_KEY, mode);
    set({ themeMode: mode });
  },

  // ── Load all data ──────────────────────────────────────────────────────

  async loadAll() {
    set({ isLoading: true });
    try {
      const [meds, schedules, appointments] = await Promise.all([
        getMedications(),
        getAllActiveSchedules(),
        getAppointments(),
      ]);
      const logs = await getDoseLogsByDate(today());
      set({ medications: meds, schedules, todayLogs: logs, appointments, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  async loadTodayLogs() {
    const logs = await getDoseLogsByDate(today());
    set({ todayLogs: logs });
  },

  // ── Add medication ─────────────────────────────────────────────────────

  async addMedication(data, scheduleInputs) {
    const med: Medication = {
      ...data,
      id: generateId(),
      isActive: true,
      createdAt: toISOString(new Date()),
    };

    await insertMedication(med);

    const schedules: Schedule[] = scheduleInputs.map((s) => ({
      ...s,
      id: generateId(),
      medicationId: med.id,
      isActive: true,
    }));

    await Promise.all(
      schedules.map(async (s) => {
        await insertSchedule(s);
        await _scheduleNotificationsForSchedule(med, s);
      })
    );

    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    set({ medications: allMeds, schedules: allSchedules });

    return med;
  },

  // ── Update medication ──────────────────────────────────────────────────

  async updateMedication(med, scheduleInputs) {
    await updateMedication(med);

    // Get existing schedules
    const existing = await getSchedulesByMedication(med.id);

    // Cancel all current notifications for this med's schedules
    await Promise.all(
      existing.map((s) =>
        Promise.all([cancelScheduleNotifications(s.id), deleteSchedule(s.id)])
      )
    );

    // Insert new schedules
    const newSchedules: Schedule[] = scheduleInputs.map((s) => ({
      ...s,
      id: generateId(),
      medicationId: med.id,
      isActive: true,
    }));

    await Promise.all(
      newSchedules.map(async (s) => {
        await insertSchedule(s);
        if (med.isActive) await _scheduleNotificationsForSchedule(med, s);
      })
    );

    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    set({ medications: allMeds, schedules: allSchedules });
  },

  // ── Delete medication ──────────────────────────────────────────────────

  async deleteMedication(id) {
    const schedules = await getSchedulesByMedication(id);
    await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
    await deleteMedication(id);
    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    set({ medications: allMeds, schedules: allSchedules });
  },

  // ── Toggle active ──────────────────────────────────────────────────────

  async toggleMedicationActive(id, isActive) {
    const { medications } = get();
    const med = medications.find((m) => m.id === id);
    if (!med) return;
    const updated = { ...med, isActive };
    await updateMedication(updated);

    const schedules = await getSchedulesByMedication(id);
    if (!isActive) {
      await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
    } else {
      await Promise.all(schedules.map((s) => _scheduleNotificationsForSchedule(updated, s)));
    }

    const allMeds = await getMedications();    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);    set({ medications: allMeds });
  },

  // ── Mark dose (taken / skipped) ────────────────────────────────────────

  async markDose(dose, status) {
    const now = new Date();
    const log: DoseLog = {
      id: generateId(),
      medicationId: dose.medication.id,
      scheduleId: dose.schedule.id,
      scheduledDate: dose.scheduledDate,
      // Persist the snoozed time when relevant so calendar/history reflect it.
      scheduledTime: dose.snoozedUntil ?? dose.scheduledTime,
      status,
      takenAt: status === "taken" ? toISOString(now) : undefined,
      createdAt: toISOString(now),
    };

    await upsertDoseLog(log);
    await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);
    // Clear any pending snooze display entry
    const doseKey = `${dose.schedule.id}-${dose.scheduledDate}`;
    set((s) => {
      const { [doseKey]: _removed, ...rest } = s.snoozedTimes;
      return { snoozedTimes: rest };
    });

    // Decrement stock and fire a low-stock alert when a dose is marked taken.
    if (status === "taken") {
      // Always read the latest in-memory stock to handle rapid consecutive marks.
      const latestMed =
        get().medications.find((m) => m.id === dose.medication.id) ??
        dose.medication;
      if (latestMed.stockQuantity != null && latestMed.stockQuantity > 0) {
        const newQty = latestMed.stockQuantity - 1;
        await updateMedicationStock(latestMed.id, newQty);
        if (
          latestMed.stockAlertThreshold != null &&
          newQty < latestMed.stockAlertThreshold
        ) {
          await scheduleStockAlert({ ...latestMed, stockQuantity: newQty });
        }
        // Sync the in-memory medications list so the stock badge updates.
        const allMeds = await getMedications();
        set({ medications: allMeds });
      }
    }

    await get().loadTodayLogs();
  },

  // ── Update dose note ──────────────────────────────────────────────────────

  async updateDoseNote(scheduleId, scheduledDate, notes) {
    await updateDoseLogNotes(scheduleId, scheduledDate, notes);
    await get().loadTodayLogs();
  },

  // ── Snooze ─────────────────────────────────────────────────────────────

  async snoozeDose(dose) {
    const now = new Date();
    const [sh, sm] = dose.schedule.time.split(':').map(Number);
    const originalDateTime = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), sh, sm
    );
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;

    if (originalDateTime > now) {
      // The scheduled time hasn't arrived yet — snooze in +15 min increments
      // relative to the current snoozed time (or the original time, if first snooze).
      const currentSnoozedHHmm = get().snoozedTimes[key];
      const baseDate = currentSnoozedHHmm
        ? (() => {
            const [bh, bm] = currentSnoozedHHmm.split(':').map(Number);
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
          })()
        : originalDateTime;
      const fireDate = addMinutes(baseDate, SNOOZE_MINUTES);
      const snoozeHHmm = format(fireDate, 'HH:mm');

      await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate, fireDate);
      set((s) => ({ snoozedTimes: { ...s.snoozedTimes, [key]: snoozeHHmm } }));
    } else {
      // Original time already passed — fire in now+15 (existing behaviour)
      const snoozeDate = addMinutes(new Date(), SNOOZE_MINUTES);
      const snoozeHHmm = format(snoozeDate, 'HH:mm');
      await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate);
      // Store the new display time so the Today screen shows the updated time.
      set((s) => ({ snoozedTimes: { ...s.snoozedTimes, [key]: snoozeHHmm } }));
    }
  },
  // ── Reschedule once (user picks a specific time for today only) ──────────────

  async rescheduleOnce(dose, newTime) {
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    const [h, m] = newTime.split(':').map(Number);
    const now = new Date();
    const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);

    // Cancel existing notifications chain for this dose
    await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate, fireDate);

    // Store the new display time
    set((s) => ({ snoozedTimes: { ...s.snoozedTimes, [key]: newTime } }));
  },

  // ── Revert snooze (undo pending snooze) ───────────────────────────────────────

  async revertSnooze(dose) {
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    // Cancel the currently active snoozed notification chain.
    await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);
    // Re-schedule the original notification chain if the original time is still in the future.
    const [h, m] = dose.schedule.time.split(":").map(Number);
    const [y, mo, d] = dose.scheduledDate.split("-").map(Number);
    const originalFireDate = new Date(y, mo - 1, d, h, m);
    if (originalFireDate > new Date()) {
      await scheduleDoseChain(dose.medication, dose.schedule, dose.scheduledDate);
    }
    // Remove the in-memory snoozed-time entry so the UI reverts to original time.
    set((s) => {
      const { [key]: _removed, ...rest } = s.snoozedTimes;
      return { snoozedTimes: rest };
    });
    if (Platform.OS !== "web")
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  },

  // ── Revert dose (undo taken/skipped) ─────────────────────────────────────────

  async revertDose(dose) {
    await deleteDoseLog(dose.schedule.id, dose.scheduledDate);
    // Re-schedule any future notifications for this dose's schedule
    await _scheduleNotificationsForSchedule(dose.medication, dose.schedule);
    // Also clear any snooze display entry
    const revertKey = `${dose.schedule.id}-${dose.scheduledDate}`;
    set((s) => {
      const { [revertKey]: _removed, ...rest } = s.snoozedTimes;
      return { snoozedTimes: rest };
    });
    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await get().loadTodayLogs();
  },
  // ── History ────────────────────────────────────────────────────────────

  async getHistoryLogs(from, to) {
    return getDoseLogsByDateRange(from, to);
  },

  // ── Helper ────────────────────────────────────────────────────────────

  getSchedulesForMedication(medicationId) {
    return get().schedules.filter((s) => s.medicationId === medicationId);
  },

  // ── Reset all data (dev / fresh start) ────────────────────────────────

  async resetAllData() {
    await cancelAllNotifications();
    await clearAllData();
    await unregisterBackgroundFetch();
    const [meds, schedules] = await Promise.all([getMedications(), getAllActiveSchedules()]);
    const logs = await getDoseLogsByDate(today());
    set({ medications: meds, schedules, todayLogs: logs, appointments: [], healthMeasurements: [], dailyCheckins: [], snoozedTimes: {} });
  },

  // ── Appointments ─────────────────────────────────────────────────

  async loadAppointments() {
    const appointments = await getAppointments();
    set({ appointments });
  },

  async addAppointment(data) {
    const appt: Appointment = {
      ...data,
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    const notificationId = await scheduleAppointmentNotification(appt);
    const apptWithNotif = { ...appt, notificationId };
    await insertAppointment(apptWithNotif);
    set((s) => ({ appointments: [...s.appointments, apptWithNotif].sort((a, b) => a.date.localeCompare(b.date)) }));
  },

  async updateAppointment(data) {
    const existing = get().appointments.find((a) => a.id === data.id);
    // Cancel old notification if any
    if (existing?.notificationId) {
      await cancelAppointmentNotification(existing.notificationId);
    }
    const appt: Appointment = { ...data, notificationId: undefined };
    const notificationId = await scheduleAppointmentNotification(appt);
    const apptWithNotif = { ...appt, notificationId };
    await updateAppointmentDb(apptWithNotif);
    set((s) => ({
      appointments: s.appointments
        .map((a) => (a.id === data.id ? apptWithNotif : a))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));
  },

  async deleteAppointment(id) {
    const appt = get().appointments.find((a) => a.id === id);
    if (appt?.notificationId) {
      await cancelAppointmentNotification(appt.notificationId);
    }
    await deleteAppointmentDb(id);
    set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) }));
  },

  // ── Health measurements ──────────────────────────────────────────

  async loadHealthMeasurements(type) {
    const items = await getHealthMeasurements(type);
    set({ healthMeasurements: items });
  },

  async addHealthMeasurement(data) {
    const m: HealthMeasurement = {
      ...data,
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    await insertHealthMeasurement(m);
    set((s) => ({ healthMeasurements: [m, ...s.healthMeasurements] }));
  },

  async deleteHealthMeasurement(id) {
    await deleteHealthMeasurementDb(id);
    set((s) => ({ healthMeasurements: s.healthMeasurements.filter((m) => m.id !== id) }));
  },

  // ── Daily check-ins ──────────────────────────────────────────────────

  async loadDailyCheckins() {
    const items = await getDailyCheckins();
    set({ dailyCheckins: items });
  },

  async saveDailyCheckin(data) {
    const checkin: DailyCheckin = {
      ...data,
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    await upsertDailyCheckin(checkin);
    set((s) => ({
      dailyCheckins: [
        checkin,
        ...s.dailyCheckins.filter((c) => c.date !== checkin.date),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    }));
  },
}));

// ─── Internal helpers ──────────────────────────────────────────────────────

async function _scheduleNotificationsForSchedule(
  med: Medication,
  schedule: Schedule
): Promise<void> {
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const date = addDays(startOfDay(now), i);
    if (!isScheduleActiveOnDate(schedule, date, med)) continue;
    const scheduledDate = toDateString(date);

    // Build fire Date
    const [h, m] = schedule.time.split(":").map(Number);
    const fireDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      h,
      m
    );
    if (fireDate <= now) continue;

    await scheduleDoseChain(med, schedule, scheduledDate);
  }
}
