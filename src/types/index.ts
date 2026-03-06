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

export type MedicationCategory =
  | "antibiotico"
  | "analgesico"
  | "antiinflamatorio"
  | "suplemento"
  | "vitamina"
  | "otro";

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

export type DoseStatus = "pending" | "taken" | "skipped";

/** Extended status used only in the display layer (never persisted to DB). */
export type TodayDoseStatus = DoseStatus | "missed";

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
}

// ─── Appointment ──────────────────────────────────────────────────────────

export interface Appointment {
  id: string;
  title: string;
  doctor?: string;
  location?: string;
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
  takenAt?: string;
  /** Free-text note attached to the dose log (if any). */
  notes?: string;
  /** HH:mm of the snoozed reminder — only set when the dose has been snoozed
   *  but the original scheduled time hasn't passed yet. */
  snoozedUntil?: string;
}
