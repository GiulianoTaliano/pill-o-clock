// ─── Medication ────────────────────────────────────────────────────────────

export type MedicationColor =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "red"
  | "teal"
  | "pink"
  | (string & {});  // allows custom hex values e.g. "#FF5733"

export type DosageUnit =
  | "mg"
  | "g"
  | "mcg"
  | "ml"
  | "gotas"
  | "comprimidos"
  | "capsulas"
  | "UI";

/** Reason the user gave for skipping a dose. */
export type SkipReason = "forgot" | "side_effect" | "no_stock" | "other";

export type MedicationCategory =
  | "antibiotico"
  | "analgesico"
  | "antiinflamatorio"
  | "suplemento"
  | "vitamina"
  | "otro";

/** A person (or pet) whose regimen lives on this device (F2 multi-profile). */
export interface Profile {
  id: string;
  /** Empty string on the built-in 'default' profile → shown as localized "Me". */
  name: string;
  color: string;
  createdAt: string;
  /** First-aid contact shown on the emergency card (F3). */
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

/** A recorded allergy (F3) — per profile, optionally pinned to an ingredient. */
export interface Allergy {
  id: string;
  profileId?: string;
  name: string;
  /** Ingredient RxCUI (NLM) — enables conflict checks; undefined = free text. */
  ingRxcui?: string;
  createdAt: string;
}

export interface Medication {
  id: string;
  name: string;
  /** Numeric quantity (e.g. 500, 1, 10) */
  dosageAmount: number;
  /** Unit of the dose (e.g. "mg", "comprimidos", "ml") */
  dosageUnit: DosageUnit;
  /** Derived display string – always "dosageAmount dosageUnit" */
  dosage: string;
  category: MedicationCategory;
  notes?: string;
  color: MedicationColor;
  /** ISO date (YYYY-MM-DD) – optional, for time-bound meds like antibiotics */
  startDate?: string;
  /** ISO date (YYYY-MM-DD) – optional */
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  /** Number of units currently in stock (optional). */
  stockQuantity?: number;
  /** Fire a low-stock notification when stockQuantity drops to this value. */
  stockAlertThreshold?: number;
  /** URI of a photo of the medication box/blister (from expo-image-picker). */
  photoUri?: string;
  /** If true, this medication has no fixed schedule — user logs it on demand. */
  isPRN?: boolean;
  /** ISO date (YYYY-MM-DD) — when the prescription must be renewed (optional). */
  renewalDate?: string;
  /** Pipe-separated scheduled-notification ids for the renewal reminders. */
  renewalNotifIds?: string;
  /** PRN safety: maximum doses per calendar day (optional). */
  prnMaxPerDay?: number;
  /** PRN safety: minimum minutes between doses (optional). */
  prnMinIntervalMinutes?: number;
  /** RxNorm SXDG id from the autocomplete pick — powers duplicate-therapy checks. */
  rxcui?: string;
  /** Owning profile (F2 multi-profile). Defaults to the active profile on insert. */
  profileId?: string;
  /** Complex regimen JSON (F3): everyN / cycle / taper — see services/regimen.ts. */
  regimen?: string;
  /** Injectable med (F3, GLP-1 wave): enables site rotation + weekly countdown. */
  isInjectable?: boolean;
  /** Archive instead of delete (F3): when set, the med is retired but its history stays. */
  archivedAt?: string;
  /** Why it was archived: finished | doctor | side_effects | other. */
  archiveReason?: string;
}

// ─── Schedule ──────────────────────────────────────────────────────────────

/**
 * An alarm belonging to a Medication.
 * days: 0=Sun,1=Mon,...6=Sat. Empty array = every day.
 */
export interface Schedule {
  id: string;
  medicationId: string;
  /** "HH:mm" 24-hour format */
  time: string;
  /** Empty = daily. Otherwise specific days of week (0–6). */
  days: number[];
  isActive: boolean;
}

// ─── Dose Log ──────────────────────────────────────────────────────────────

export type DoseStatus = "pending" | "taken" | "skipped" | "missed";

/** Alias kept for backward compatibility. */
export type TodayDoseStatus = DoseStatus;

export interface DoseLog {
  id: string;
  medicationId: string;
  scheduleId: string;
  /** YYYY-MM-DD */
  scheduledDate: string;
  /** HH:mm */
  scheduledTime: string;
  status: DoseStatus;
  /** ISO datetime – populated when status = 'taken' */
  takenAt?: string;
  createdAt: string;
  /** Optional free-text note added by the user when logging the dose. */
  notes?: string;
  /** Reason the user gave for skipping this dose (only set when status = 'skipped'). */
  skipReason?: SkipReason;
  /** Injection site key (F3) — see services/injectionSites.ts; injectables only. */
  injectionSite?: string;
}

// ─── Appointment ──────────────────────────────────────────────────────────

/** GPS coordinates tied to an appointment location. */
export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface Appointment {
  id: string;
  title: string;
  doctor?: string;
  /** Free-text location label (address, hospital name, etc.) */
  location?: string;
  /** GPS coordinates for the location — set via the in-app map picker. */
  locationCoords?: LocationCoords;
  notes?: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm – optional */
  time?: string;
  /** Minutes before appointment to fire notification. 0 = no reminder. */
  reminderMinutes?: number;
  /** Expo notification identifier for cancellation. */
  notificationId?: string;
  createdAt: string;
  /** Owning profile (F2 multi-profile). Defaults to the active profile on insert. */
  profileId?: string;
}

// ─── Appointment documents ──────────────────────────────────────────────────

export interface AppointmentDocument {
  id: string;
  appointmentId: string;
  fileName: string;
  mimeType: string;
  /** Path inside FileSystem.documentDirectory */
  fileUri: string;
  fileSize?: number;
  createdAt: string;
}

// ─── Health measurements ─────────────────────────────────────────────────────

export type MeasurementType =
  | 'blood_pressure'
  | 'glucose'
  | 'weight'
  | 'spo2'
  | 'heart_rate';

export interface HealthMeasurement {
  id: string;
  type: MeasurementType;
  /** Primary value (systolic for BP, glucose level, kg, SpO2 %, BPM) */
  value1: number;
  /** Secondary value — only used for blood_pressure (diastolic) */
  value2?: number;
  /** ISO datetime of when the measurement was taken */
  measuredAt: string;
  notes?: string;
  createdAt: string;
  /** Owning profile (F2 multi-profile). Defaults to the active profile on insert. */
  profileId?: string;
}

// ─── Daily check-in ────────────────────────────────────────────────────────

export interface DailyCheckin {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 1 = very bad · 5 = excellent */
  mood: 1 | 2 | 3 | 4 | 5;
  /** Array of symptom keys e.g. ["headache", "nausea"] */
  symptoms: string[];
  notes?: string;
  createdAt: string;
  /** Owning profile (F2 multi-profile). Defaults to the active profile on insert. */
  profileId?: string;
}

// ─── Notification mapping ──────────────────────────────────────────────────

/** Stored in AsyncStorage: maps notificationId → doseLogId */
export interface NotificationMap {
  [notificationId: string]: {
    doseLogId: string;
    medicationId: string;
    scheduleId: string;
    scheduledDate: string;
    scheduledTime: string;
  };
}

// ─── Today's scheduled dose ────────────────────────────────────────────────

/** Combined view used by the Home screen */
export interface TodayDose {
  doseLogId?: string;
  medication: Medication;
  schedule: Schedule;
  scheduledDate: string;
  scheduledTime: string;
  status: TodayDoseStatus;
  /** Injection site recorded on the log (F3 injectables). */
  injectionSite?: string;
  takenAt?: string;
  /** Free-text note attached to the dose log (if any). */
  notes?: string;
  /** Skip reason — only set when status is "skipped". */
  skipReason?: SkipReason;
  /** HH:mm of the snoozed reminder — only set when the dose has been snoozed
   *  but the original scheduled time hasn't passed yet. */
  snoozedUntil?: string;
}
