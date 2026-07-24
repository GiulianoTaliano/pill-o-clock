/**
 * App lock — optional privacy layer over the app, delegated entirely to the OS.
 *
 * Threat model: a casual person picking up an unlocked phone, not forensics.
 *
 * The app deliberately does NOT implement its own PIN. Unlocking goes through
 * the device's own authentication (Face ID / Touch ID / fingerprint, falling
 * back to the device passcode or pattern) via expo-local-authentication. The OS
 * owns the secret, the retry throttling and the accessibility of the unlock UI,
 * so we never store, hash or verify a credential ourselves — strictly less
 * attack surface than the 4-digit PIN this replaced.
 *
 * Consequence: the lock requires the device to have a screen lock enrolled
 * (SecurityLevel != NONE). Without one there is nothing to authenticate
 * against, so the lock cannot be enabled — see isDeviceSecuredAsync().
 *
 * SAFETY RULE (do not regress): the fullscreen alarm route (/alarm) is NEVER
 * gated — a medication alarm must be answerable without unlocking the app.
 * Enforced by AppLockGate, documented here because this is the module people
 * will read first.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

/** Re-lock only after this much time in background (avoids app-switch nags). */
export const LOCK_GRACE_MS = 60_000;

// Legacy keys from the old self-managed PIN. Kept only so we can wipe them.
const LEGACY_PIN_HASH_KEY = "pilloclock.app_lock.pin_hash";
const LEGACY_PIN_SALT_KEY = "pilloclock.app_lock.pin_salt";

// Web has no SecureStore/biometrics and no lock-screen use case.
const supported = Platform.OS !== "web";

export function isAppLockSupported(): boolean {
  return supported;
}

// ─── Flags (sync, MMKV) ────────────────────────────────────────────────────

export function isAppLockEnabled(): boolean {
  return supported && storage.getString(STORAGE_KEYS.APP_LOCK_ENABLED) === "1";
}

// ─── Device security ───────────────────────────────────────────────────────

/**
 * True when the device has any screen lock enrolled (biometrics OR passcode).
 * The app lock is meaningless without one, because there would be no
 * credential for the OS to check.
 */
export async function isDeviceSecuredAsync(): Promise<boolean> {
  if (!supported) return false;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** True when the device can additionally use biometrics (for copy/icons only). */
export async function hasBiometricsAsync(): Promise<boolean> {
  if (!supported) return false;
  try {
    const [hw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hw && enrolled;
  } catch {
    return false;
  }
}

// ─── Authentication ────────────────────────────────────────────────────────

/**
 * Prompts the OS for authentication.
 *
 * `disableDeviceFallback: false` is the whole point: when biometrics are
 * unavailable, not enrolled or repeatedly fail, iOS/Android fall back to the
 * device passcode instead of to an in-app PIN pad.
 */
export async function authenticateAsync(promptMessage: string): Promise<boolean> {
  if (!supported) return true;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

// ─── Enable / disable ──────────────────────────────────────────────────────

/**
 * Enables the lock. Throws when the device has no screen lock enrolled — the
 * caller is expected to surface that as "set up a passcode first".
 */
export async function enableAppLock(): Promise<void> {
  if (!supported) throw new Error("App lock is not supported on this platform");
  if (!(await isDeviceSecuredAsync())) {
    throw new Error("DEVICE_NOT_SECURED");
  }
  storage.set(STORAGE_KEYS.APP_LOCK_ENABLED, "1");
}

/** Disables the lock. */
export async function disableAppLock(): Promise<void> {
  storage.remove(STORAGE_KEYS.APP_LOCK_ENABLED);
  await clearLegacyPin();
}

// ─── Migration from the old in-app PIN ─────────────────────────────────────

/**
 * Wipes the credentials left behind by the previous self-managed PIN.
 *
 * The enabled flag is intentionally preserved: a user who had the lock on keeps
 * it on, it just authenticates through the OS from now on. Safe to call
 * repeatedly — missing keys are a no-op.
 */
export async function clearLegacyPin(): Promise<void> {
  if (!supported) return;
  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_PIN_HASH_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_PIN_SALT_KEY).catch(() => {}),
  ]);
  // The old "prefer biometrics" toggle no longer exists: the OS decides whether
  // to show biometrics or the passcode, so the preference is meaningless.
  storage.remove(STORAGE_KEYS.APP_LOCK_BIOMETRIC);
}

/**
 * One-time startup migration.
 *
 * Besides wiping the legacy PIN, it turns the lock OFF when the device has no
 * screen lock enrolled — otherwise such a user would be stuck behind an overlay
 * that can never authenticate.
 */
export async function migrateAppLock(): Promise<void> {
  if (!supported) return;
  await clearLegacyPin();
  if (isAppLockEnabled() && !(await isDeviceSecuredAsync())) {
    storage.remove(STORAGE_KEYS.APP_LOCK_ENABLED);
  }
}
