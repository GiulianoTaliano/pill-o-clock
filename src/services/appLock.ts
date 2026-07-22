/**
 * App lock (F1: PIN + biometric gate) — optional privacy layer over the app.
 *
 * Threat model: a casual person picking up an unlocked phone, not forensics.
 * The 4-digit PIN is never stored: only a salted SHA-256 hash, kept in
 * expo-secure-store (Android Keystore / iOS Keychain backed). Enable/biometric
 * flags live in MMKV so the gate can decide synchronously at startup.
 *
 * SAFETY RULE (do not regress): the fullscreen alarm route (/alarm) is NEVER
 * gated — a medication alarm must be answerable without unlocking the app.
 * Enforced by AppLockGate, documented here because this is the module people
 * will read first.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

/** PIN length required by the pads (fixed — keeps the UX dead simple). */
export const PIN_LENGTH = 4;

/** Re-lock only after this much time in background (avoids app-switch nags). */
export const LOCK_GRACE_MS = 60_000;

/** Wrong-attempt throttling. */
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_COOLDOWN_MS = 30_000;

const PIN_HASH_KEY = "pilloclock.app_lock.pin_hash";
const PIN_SALT_KEY = "pilloclock.app_lock.pin_salt";

// Web has no SecureStore/biometrics and no lock-screen use case.
const supported = Platform.OS !== "web";

export function isAppLockSupported(): boolean {
  return supported;
}

// ─── Flags (sync, MMKV) ────────────────────────────────────────────────────

export function isAppLockEnabled(): boolean {
  return supported && storage.getString(STORAGE_KEYS.APP_LOCK_ENABLED) === "1";
}

export function isBiometricPreferred(): boolean {
  // Default ON: if the device has biometrics the gate tries them first.
  return storage.getString(STORAGE_KEYS.APP_LOCK_BIOMETRIC) !== "0";
}

export function setBiometricPreferred(on: boolean): void {
  storage.set(STORAGE_KEYS.APP_LOCK_BIOMETRIC, on ? "1" : "0");
}

// ─── PIN (async, SecureStore) ──────────────────────────────────────────────

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`
  );
}

function randomSaltHex(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Persists the PIN (salted hash) and enables the lock. */
export async function enableAppLock(pin: string): Promise<void> {
  if (!supported) throw new Error("App lock is not supported on this platform");
  const salt = randomSaltHex();
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  storage.set(STORAGE_KEYS.APP_LOCK_ENABLED, "1");
}

/** Disables the lock and wipes the stored PIN hash. */
export async function disableAppLock(): Promise<void> {
  storage.delete(STORAGE_KEYS.APP_LOCK_ENABLED);
  await SecureStore.deleteItemAsync(PIN_HASH_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(PIN_SALT_KEY).catch(() => {});
}

/** Replaces the PIN without toggling the enabled flag. */
export async function changePin(pin: string): Promise<void> {
  await enableAppLock(pin);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const [salt, expected] = await Promise.all([
    SecureStore.getItemAsync(PIN_SALT_KEY),
    SecureStore.getItemAsync(PIN_HASH_KEY),
  ]);
  if (!salt || !expected) return false;
  const actual = await hashPin(pin, salt);
  return actual === expected;
}

export async function hasPin(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(PIN_HASH_KEY));
}
