import type { Medication, Schedule, DoseLog, TodayDose, Appointment, AppointmentDocument, HealthMeasurement, MeasurementType, DailyCheckin, SkipReason, Profile } from "../types";

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
    // `id` is optional: existing schedules carry their DB id so their identity
    // (and attached dose_logs) is preserved; new schedules omit it (audit H17).
    scheduleInputs: (Omit<Schedule, "id" | "medicationId" | "isActive"> & { id?: string })[]
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
  snoozeDose: (dose: TodayDose, minutes?: number) => Promise<void>;
  rescheduleOnce: (dose: TodayDose, newTime: string) => Promise<void>;
  revertDose: (dose: TodayDose) => Promise<void>;
  revertSnooze: (dose: TodayDose) => Promise<void>;
  getHistoryLogs: (from: string, to: string) => Promise<DoseLog[]>;
  getSchedulesForMedication: (medicationId: string) => Schedule[];
  /**
   * Logs a PRN dose. When safety limits are configured and would be exceeded,
   * returns the check WITHOUT logging — the UI warns and may retry with
   * { force: true } after explicit user confirmation.
   */
  logPRNDose: (
    medication: Medication,
    opts?: { force?: boolean }
  ) => Promise<import("../services/prnLimits").PrnLimitCheck | undefined>;
}

export interface AppointmentsSlice {
  appointments: Appointment[];
  appointmentDocuments: AppointmentDocument[];
  loadAppointments: () => Promise<void>;
  addAppointment: (data: Omit<Appointment, "id" | "createdAt" | "notificationId">) => Promise<void>;
  updateAppointment: (appt: Omit<Appointment, "notificationId">) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  loadAppointmentDocuments: (appointmentId: string) => Promise<void>;
  addAppointmentDocument: (appointmentId: string, pickerAsset: { uri: string; name: string; mimeType?: string; size?: number }) => Promise<void>;
  removeAppointmentDocument: (docId: string) => Promise<void>;
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

export interface ProfilesSlice {
  profiles: Profile[];
  /** Scopes UI lists only — alarms always cover every profile. */
  activeProfileId: string;
  loadProfiles: () => Promise<void>;
  addProfile: (name: string, color: string) => Promise<Profile>;
  renameProfile: (
    id: string,
    name: string,
    color?: string,
    contact?: { name: string; phone: string }
  ) => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  /** Deletes the profile AND all its data, cancelling its alarms first. */
  removeProfile: (id: string) => Promise<void>;
}

export interface CoreSlice {
  todayLogs: DoseLog[];
  isLoading: boolean;
  themeMode: ThemeMode;
  /** Senior / low-vision mode: larger type + touch targets on core surfaces (F1). */
  seniorMode: boolean;
  setSeniorMode: (on: boolean) => void;
  loadAll: () => Promise<void>;
  loadThemeMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  loadTodayLogs: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

// ─── Combined state ────────────────────────────────────────────────────────

export type AppState = MedicationsSlice & AppointmentsSlice & HealthSlice & UISlice & ProfilesSlice & CoreSlice;
