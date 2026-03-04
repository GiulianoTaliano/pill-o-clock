// ─── Medication ────────────────────────────────────────────────────────────

export type MedicationColor =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "red"
  | "teal"
  | "pink";

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
}
