/**
 * Unit tests for the app-lock service (F1: PIN + biometric gate).
 * SecureStore/crypto are backed by the deterministic jest.setup mocks;
 * MMKV flags by __mocks__/react-native-mmkv.
 */
import {
  enableAppLock,
  disableAppLock,
  changePin,
  verifyPin,
  hasPin,
  isAppLockEnabled,
  isBiometricPreferred,
  setBiometricPreferred,
  PIN_LENGTH,
} from "../src/services/appLock";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";

describe("appLock", () => {
  beforeEach(async () => {
    await disableAppLock();
    storage.remove(STORAGE_KEYS.APP_LOCK_BIOMETRIC);
  });

  it("is disabled by default with no PIN stored", async () => {
    expect(isAppLockEnabled()).toBe(false);
    expect(await hasPin()).toBe(false);
    expect(await verifyPin("1234")).toBe(false);
  });

  it("enableAppLock stores a PIN hash and flips the flag", async () => {
    await enableAppLock("1234");
    expect(isAppLockEnabled()).toBe(true);
    expect(await hasPin()).toBe(true);
    expect(await verifyPin("1234")).toBe(true);
    expect(await verifyPin("9999")).toBe(false);
  });

  it("disableAppLock wipes the PIN", async () => {
    await enableAppLock("1234");
    await disableAppLock();
    expect(isAppLockEnabled()).toBe(false);
    expect(await hasPin()).toBe(false);
    expect(await verifyPin("1234")).toBe(false);
  });

  it("changePin replaces the previous PIN", async () => {
    await enableAppLock("1234");
    await changePin("4321");
    expect(await verifyPin("1234")).toBe(false);
    expect(await verifyPin("4321")).toBe(true);
    expect(isAppLockEnabled()).toBe(true);
  });

  it("biometric preference defaults to ON and persists OFF", () => {
    expect(isBiometricPreferred()).toBe(true);
    setBiometricPreferred(false);
    expect(isBiometricPreferred()).toBe(false);
    setBiometricPreferred(true);
    expect(isBiometricPreferred()).toBe(true);
  });

  it("exposes a 4-digit PIN length", () => {
    expect(PIN_LENGTH).toBe(4);
  });
});
