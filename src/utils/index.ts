import { format, addDays, startOfDay } from "date-fns";
import type { TFunction } from "i18next";
import { Medication, Schedule, DosageUnit, MedicationCategory } from "../types";

/**
 * Generate a UUID v4.
 * Uses the Web Crypto API (crypto.randomUUID) when available — this is the
 * case in production / development builds with a modern Hermes engine.
 * Falls back to a Math.random-based implementation in environments that don't
 * expose the global `crypto` object (e.g. Expo Go with older Hermes).
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: RFC 4122 v4 UUID via Math.random
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Today's date as YYYY-MM-DD */
export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Format a Date to YYYY-MM-DD */
export function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Format a Date to ISO 8601 string */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/** Parse "HH:mm" into { hours, minutes } */
export function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

/** Return true if a schedule is active on a given Date */
export function isScheduleActiveOnDate(schedule: Schedule, date: Date, medication: Medication): boolean {
  if (!schedule.isActive || !medication.isActive) return false;

  const dateStr = toDateString(date);

  // Never show entries before the medication was created
  const createdDate = toDateString(new Date(medication.createdAt));
  if (dateStr < createdDate) return false;

  // Check time-bound medication
  if (medication.startDate && dateStr < medication.startDate) return false;
  if (medication.endDate   && dateStr > medication.endDate)   return false;

  // Daily schedule
  if (schedule.days.length === 0) return true;

  const dayOfWeek = date.getDay(); // 0 = Sun
  return schedule.days.includes(dayOfWeek);
}

/** Get the next N dates starting from today */
export function getNextDates(n: number): Date[] {
  const dates: Date[] = [];
  const base = startOfDay(new Date());
  for (let i = 0; i < n; i++) {
    dates.push(addDays(base, i));
  }
  return dates;
}

/** Static Spanish fallback – use getDayNamesShort(t) in components. */
export const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DAY_NAMES_FULL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Translated day names — use in components. */
export function getDayNamesShort(t: TFunction): string[] {
  return t("days.short", { returnObjects: true }) as string[];
}
export function getDayNamesFull(t: TFunction): string[] {
  return t("days.full", { returnObjects: true }) as string[];
}

/** Translated category label — use in components instead of CATEGORY_CONFIG.label */
export function getCategoryLabel(category: MedicationCategory, t: TFunction): string {
  return t(`categories.${category}`);
}

/** Translated dosage unit label — use in components instead of DOSAGE_UNITS[].label */
export function getDosageLabel(unit: DosageUnit, t: TFunction): string {
  const localized: Partial<Record<DosageUnit, string>> = {
    gotas:       t("dosageUnits.gotas"),
    comprimidos: t("dosageUnits.comprimidos"),
    capsulas:    t("dosageUnits.capsulas"),
  };
  return localized[unit] ?? unit;
}

/** Color palette for preset medication colors */
export const MEDICATION_COLORS: Record<string, { bg: string; light: string; text: string; border: string }> = {
  blue:   { bg: "#3b82f6", light: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  green:  { bg: "#22c55e", light: "#dcfce7", text: "#15803d", border: "#86efac" },
  purple: { bg: "#a855f7", light: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
  orange: { bg: "#f97316", light: "#ffedd5", text: "#c2410c", border: "#fdba74" },
  red:    { bg: "#ef4444", light: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  teal:   { bg: "#14b8a6", light: "#ccfbf1", text: "#0f766e", border: "#5eead4" },
  pink:   { bg: "#ec4899", light: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
};

/** Derive a color config from an arbitrary hex string (e.g. custom-picked colors) */
function hexToColorConfig(hex: string): { bg: string; light: string; text: string; border: string } {
  const h = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const dr = Math.floor(r * 0.55).toString(16).padStart(2, "0");
  const dg = Math.floor(g * 0.55).toString(16).padStart(2, "0");
  const db = Math.floor(b * 0.55).toString(16).padStart(2, "0");
  return {
    bg:     hex,
    light:  `${hex}33`,   // 20% alpha – works as 8-digit hex in RN
    border: `${hex}80`,   // 50% alpha
    text:   `#${dr}${dg}${db}`,
  };
}

/** Get color config for any MedicationColor (preset name or custom hex) */
export function getColorConfig(color: string): { bg: string; light: string; text: string; border: string } {
  return MEDICATION_COLORS[color] ?? hexToColorConfig(color);
}

// ─── Dosage units ──────────────────────────────────────────────────────────

export const DOSAGE_UNITS: { value: DosageUnit; label: string }[] = [
  { value: "mg",          label: "mg" },
  { value: "g",           label: "g" },
  { value: "mcg",         label: "mcg" },
  { value: "ml",          label: "ml" },
  { value: "gotas",       label: "gotas" },
  { value: "comprimidos", label: "comp." },
  { value: "capsulas",    label: "cáps." },
  { value: "UI",          label: "UI" },
];

// ─── Category config ───────────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<
  MedicationCategory,
  { label: string; icon: string; priority: number; tint: string }
> = {
  antibiotico:      { label: "Antibiótico",      icon: "bandage-outline",      priority: 1, tint: "#ef4444" },
  analgesico:       { label: "Analgésico",        icon: "thermometer-outline",  priority: 2, tint: "#f97316" },
  antiinflamatorio: { label: "Antiinflamatorio",  icon: "flame-outline",        priority: 2, tint: "#f97316" },
  suplemento:       { label: "Suplemento",        icon: "leaf-outline",         priority: 3, tint: "#22c55e" },
  vitamina:         { label: "Vitamina",          icon: "sunny-outline",        priority: 3, tint: "#eab308" },
  otro:             { label: "Otro",              icon: "medical-outline",      priority: 4, tint: "#64748b" },
};
