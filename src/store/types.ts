import type { Medication, Schedule, DoseLog, TodayDose, Appointment, HealthMeasurement, MeasurementType, DailyCheckin, SkipReason } from "../types";

// ─── Theme ─────────────────────────────────────────────────────────────────

export type ThemeMode = "system" | "light" | "dark";

// ─── Slice interfaces ──────────────────────────────────────────────────────

export interface MedicationsSlice {
  medications: Medication[];
  schedules: Schedule[];

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
    notes?: string,
    skipReason?: SkipReason
  ) => Promise<void>;

  updateDoseNote: (scheduleId: string, scheduledDate: string, notes: string) => Promise<void>;
  snoozeDose: (dose: TodayDose) => Promise<void>;
  rescheduleOnce: (dose: TodayDose, newTime: string) => Promise<void>;
  revertDose: (dose: TodayDose) => Promise<void>;
  revertSnooze: (dose: TodayDose) => Promise<void>;
  getHistoryLogs: (from: string, to: string) => Promise<DoseLog[]>;
  getSchedulesForMedication: (medicationId: string) => Schedule[];
  logPRNDose: (medication: Medication) => Promise<void>;
}

export interface AppointmentsSlice {
  appointments: Appointment[];
  loadAppointments: () => Promise<void>;
  addAppointment: (data: Omit<Appointment, "id" | "createdAt" | "notificationId">) => Promise<void>;
  updateAppointment: (appt: Omit<Appointment, "notificationId">) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
}

export interface HealthSlice {
  healthMeasurements: HealthMeasurement[];
  loadHealthMeasurements: (type?: MeasurementType) => Promise<void>;
  addHealthMeasurement: (data: Omit<HealthMeasurement, "id" | "createdAt">) => Promise<void>;
  deleteHealthMeasurement: (id: string) => Promise<void>;

  dailyCheckins: DailyCheckin[];
  loadDailyCheckins: () => Promise<void>;
  saveDailyCheckin: (data: Omit<DailyCheckin, "id" | "createdAt">) => Promise<void>;
}

export interface UISlice {
  selectedAppointmentId: string | null;
  setSelectedAppointmentId: (id: string | null) => void;
  pendingEditAppointmentId: string | null;
  setPendingEditAppointmentId: (id: string | null) => void;
  snoozedTimes: Record<string, string>;
}

export interface CoreSlice {
  todayLogs: DoseLog[];
  isLoading: boolean;
  themeMode: ThemeMode;
  loadAll: () => Promise<void>;
  loadThemeMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  loadTodayLogs: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

// ─── Combined state ────────────────────────────────────────────────────────

export type AppState = MedicationsSlice & AppointmentsSlice & HealthSlice & UISlice & CoreSlice;
