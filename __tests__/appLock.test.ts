/**
 * Unit tests for the app-lock service.
 *
 * The app no longer owns a PIN: authentication is delegated to the OS
 * (biometrics with device-passcode fallback). These tests cover the enable /
 * disable flow, the "device has no screen lock" guard, and the migration away
 * from the legacy in-app PIN.
 *
 * SecureStore is backed by the deterministic jest.setup mocks; MMKV flags by
 * __mocks__/react-native-mmkv; expo-local-authentication by jest.setup.
 */
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  enableAppLock,
  disableAppLock,
  isAppLockEnabled,
  isDeviceSecuredAsync,
  authenticateAsync,
  migrateAppLock,
  clearLegacyPin,
} from "../src/services/appLock";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";

const mockAuth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

const LEGACY_PIN_HASH_KEY = "pilloclock.app_lock.pin_hash";
const LEGACY_PIN_SALT_KEY = "pilloclock.app_lock.pin_salt";

/** SecurityLevel.SECRET — a passcode/pattern is enrolled. */
const SECURED = 1;
/** SecurityLevel.NONE — no screen lock at all. */
const NOT_SECURED = 0;

describe("appLock", () => {
  beforeEach(async () => {
    storage.remove(STORAGE_KEYS.APP_LOCK_ENABLED);
    storage.remove(STORAGE_KEYS.APP_LOCK_BIOMETRIC);
    (mockAuth.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(SECURED);
    (mockAuth.authenticateAsync as jest.Mock).mockResolvedValue({ success: false });
    jest.clearAllMocks();
    (mockAuth.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(SECURED);
  });

  it("is disabled by default", () => {
    expect(isAppLockEnabled()).toBe(false);
  });

  it("enableAppLock flips the flag when the device has a screen lock", async () => {
    await enableAppLock();
    expect(isAppLockEnabled()).toBe(true);
  });

  it("disableAppLock clears the flag", async () => {
    await enableAppLock();
    await disableAppLock();
    expect(isAppLockEnabled()).toBe(false);
  });

  // The lock is meaningless without an OS credential to check against, so
  // enabling must fail loudly rather than trapping the user behind an overlay
  // that can never authenticate.
  it("enableAppLock refuses when the device has no screen lock", async () => {
    (mockAuth.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(NOT_SECURED);
    await expect(enableAppLock()).rejects.toThrow("DEVICE_NOT_SECURED");
    expect(isAppLockEnabled()).toBe(false);
  });

  describe("isDeviceSecuredAsync", () => {
    it("is true when a passcode or biometric is enrolled", async () => {
      (mockAuth.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(SECURED);
      expect(await isDeviceSecuredAsync()).toBe(true);
    });

    it("is false with no screen lock", async () => {
      (mockAuth.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(NOT_SECURED);
      expect(await isDeviceSecuredAsync()).toBe(false);
    });

    it("is false (fail closed) when the OS query throws", async () => {
      (mockAuth.getEnrolledLevelAsync as jest.Mock).mockRejectedValue(new Error("boom"));
      expect(await isDeviceSecuredAsync()).toBe(false);
    });
  });

  describe("authenticateAsync", () => {
    // disableDeviceFallback:false is the whole point of this refactor — it is
    // what makes the OS offer the device passcode instead of an in-app PIN pad.
    it("asks the OS with the device-passcode fallback enabled", async () => {
      (mockAuth.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });
      expect(await authenticateAsync("Unlock")).toBe(true);
      expect(mockAuth.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ disableDeviceFallback: false })
      );
    });

    it("returns false when the user cancels", async () => {
      (mockAuth.authenticateAsync as jest.Mock).mockResolvedValue({ success: false });
      expect(await authenticateAsync("Unlock")).toBe(false);
    });

    it("returns false when the OS throws", async () => {
      (mockAuth.authenticateAsync as jest.Mock).mockRejectedValue(new Error("boom"));
      expect(await authenticateAsync("Unlock")).toBe(false);
    });
  });

  describe("migration from the legacy in-app PIN", () => {
    it("wipes the stored PIN hash and salt", async () => {
      await SecureStore.setItemAsync(LEGACY_PIN_HASH_KEY, "deadbeef");
      await SecureStore.setItemAsync(LEGACY_PIN_SALT_KEY, "cafe");

      await clearLegacyPin();

      expect(await SecureStore.getItemAsync(LEGACY_PIN_HASH_KEY)).toBeNull();
      expect(await SecureStore.getItemAsync(LEGACY_PIN_SALT_KEY)).toBeNull();
    });

    // A user who had the lock on keeps it on — it just authenticates through
    // the OS from now on.
    it("keeps the lock enabled when the device is secured", async () => {
      await enableAppLock();
      await migrateAppLock();
      expect(isAppLockEnabled()).toBe(true);
    });

    // ...but a device with no screen lock would be permanently stuck, so the
    // migration turns the lock off instead.
    it("turns the lock off when the device has no screen lock", async () => {
      await enableAppLock();
      (mockAuth.getEnrolledLevelAsync as jest.Mock).mockResolvedValue(NOT_SECURED);

      await migrateAppLock();

      expect(isAppLockEnabled()).toBe(false);
    });

    // Regression guard: a transient OS failure must NOT be read as "no screen
    // lock". Treating it that way would silently strip the user's protection on
    // every launch — the lock would look permanently broken.
    it("keeps the lock enabled when the OS query fails", async () => {
      await enableAppLock();
      (mockAuth.getEnrolledLevelAsync as jest.Mock).mockRejectedValue(new Error("boom"));

      await migrateAppLock();

      expect(isAppLockEnabled()).toBe(true);
    });

    it("is safe to run repeatedly with nothing stored", async () => {
      await expect(migrateAppLock()).resolves.toBeUndefined();
      await expect(migrateAppLock()).resolves.toBeUndefined();
    });
  });
});
