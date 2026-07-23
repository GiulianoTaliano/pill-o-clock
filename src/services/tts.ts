/**
 * Spoken alarms (F4 — TTS): reads the dose reminder aloud when the alarm
 * screen opens. Hands-free support for low-vision and elderly users.
 * OPT-IN (default off) — noise discipline. Uses the device TTS engine via
 * expo-speech; no audio leaves the device.
 */
import * as Speech from "expo-speech";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";
import i18n from "../i18n";

export function isTtsEnabled(): boolean {
  return storage.getString(STORAGE_KEYS.TTS_ENABLED) === "1";
}

export function setTtsEnabled(on: boolean): void {
  storage.set(STORAGE_KEYS.TTS_ENABLED, on ? "1" : "0");
}

/** BCP-47 voice language for the current app language. */
export function ttsLanguage(): string {
  const lang = i18n.language ?? "es";
  if (lang.startsWith("es")) return "es-ES";
  if (lang.startsWith("pt")) return "pt-BR";
  return "en-US";
}

/**
 * Speaks a dose reminder ("Time to take X, dose Y"). Slightly slowed rate
 * for intelligibility. Fire-and-forget; failures never affect the alarm.
 */
export function speakDoseReminder(medName: string, doseText: string): void {
  if (!isTtsEnabled()) return;
  try {
    Speech.speak(i18n.t("tts.alarmSpeech", { name: medName, dose: doseText }) as string, {
      language: ttsLanguage(),
      rate: 0.9,
    });
  } catch {
    /* TTS engine unavailable — the visual/audio alarm still covers the user */
  }
}

/** Stops any ongoing speech (call when the alarm is confirmed/dismissed). */
export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    /* ignore */
  }
}
