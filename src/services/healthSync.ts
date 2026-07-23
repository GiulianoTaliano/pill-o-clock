/**
 * Health Connect vitals sync (F2) — one-way push of the user's measurements
 * into Android's ON-DEVICE Health Connect store. No backend involved: Health
 * Connect is a local store, so this stays inside the local-first posture.
 *
 * Scope v1: Android only (our testing track). iOS/HealthKit is a planned
 * follow-up — do not fake support. Opt-in via Settings; permissions are
 * requested when the user enables the toggle.
 */
import { Platform } from "react-native";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";
import { HealthMeasurement } from "../types";

// Lazy require: the native module must not load unless the feature is used.
type HC = typeof import("react-native-health-connect");
function hc(): HC {
  return require("react-native-health-connect") as HC;
}

export function isHealthSyncSupported(): boolean {
  return Platform.OS === "android";
}

export function isHealthSyncEnabled(): boolean {
  return isHealthSyncSupported() && storage.getString(STORAGE_KEYS.HEALTH_SYNC) === "1";
}

const WRITE_PERMISSIONS = [
  { accessType: "write", recordType: "BloodPressure" },
  { accessType: "write", recordType: "BloodGlucose" },
  { accessType: "write", recordType: "Weight" },
  { accessType: "write", recordType: "OxygenSaturation" },
  { accessType: "write", recordType: "HeartRate" },
] as const;

/**
 * Initializes Health Connect and requests write permissions.
 * Returns true (and persists the flag) when at least one was granted.
 */
export async function enableHealthSync(): Promise<boolean> {
  if (!isHealthSyncSupported()) return false;
  try {
    const ok = await hc().initialize();
    if (!ok) return false;
    const granted = await hc().requestPermission(
      WRITE_PERMISSIONS as unknown as Parameters<HC["requestPermission"]>[0]
    );
    if (!granted || granted.length === 0) return false;
    storage.set(STORAGE_KEYS.HEALTH_SYNC, "1");
    return true;
  } catch {
    return false;
  }
}

export function disableHealthSync(): void {
  storage.remove(STORAGE_KEYS.HEALTH_SYNC);
}

/**
 * Pure mapping: our measurement → a Health Connect record (null when the
 * type can't be represented). Exported for unit tests.
 */
export function buildHealthConnectRecord(m: HealthMeasurement): Record<string, unknown> | null {
  const time = m.measuredAt;
  switch (m.type) {
    case "blood_pressure":
      if (m.value2 == null) return null;
      return {
        recordType: "BloodPressure",
        time,
        systolic: { value: m.value1, unit: "millimetersOfMercury" },
        diastolic: { value: m.value2, unit: "millimetersOfMercury" },
        bodyPosition: 0, // unknown
        measurementLocation: 0, // unknown
      };
    case "glucose":
      return {
        recordType: "BloodGlucose",
        time,
        level: { value: m.value1, unit: "milligramsPerDeciliter" },
        specimenSource: 0,
        mealType: 0,
        relationToMeal: 0,
      };
    case "weight":
      return {
        recordType: "Weight",
        time,
        weight: { value: m.value1, unit: "kilograms" },
      };
    case "spo2":
      return { recordType: "OxygenSaturation", time, percentage: m.value1 };
    case "heart_rate":
      return {
        recordType: "HeartRate",
        startTime: time,
        // Instantaneous reading modeled as a 1-second interval with one sample
        // (Health Connect requires endTime > startTime on series records).
        endTime: new Date(new Date(time).getTime() + 1000).toISOString(),
        samples: [{ time, beatsPerMinute: m.value1 }],
      };
    default:
      return null;
  }
}

/**
 * Fire-and-forget push of a saved measurement. Never throws — a sync failure
 * must not affect the local save.
 */
export async function syncMeasurementToHealthConnect(m: HealthMeasurement): Promise<void> {
  if (!isHealthSyncEnabled()) return;
  const record = buildHealthConnectRecord(m);
  if (!record) return;
  try {
    await hc().initialize();
    await hc().insertRecords([record as never]);
  } catch (e) {
    console.warn("[healthSync] insert failed", e);
  }
}
