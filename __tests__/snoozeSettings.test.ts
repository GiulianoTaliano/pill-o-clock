/**
 * Unit tests for the user-configurable default snooze interval (F1).
 * storage is backed by the __mocks__/react-native-mmkv in-memory store.
 */
import {
  SNOOZE_OPTIONS,
  DEFAULT_SNOOZE_MINUTES,
  getDefaultSnoozeMinutes,
  setDefaultSnoozeMinutes,
} from "../src/services/snoozeSettings";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";

describe("snoozeSettings", () => {
  beforeEach(() => {
    storage.remove(STORAGE_KEYS.SNOOZE_MINUTES);
  });

  it("falls back to DEFAULT_SNOOZE_MINUTES when unset", () => {
    expect(getDefaultSnoozeMinutes()).toBe(DEFAULT_SNOOZE_MINUTES);
  });

  it("persists and returns a valid option", () => {
    setDefaultSnoozeMinutes(30);
    expect(getDefaultSnoozeMinutes()).toBe(30);
    expect(storage.getString(STORAGE_KEYS.SNOOZE_MINUTES)).toBe("30");
  });

  it("accepts every offered option", () => {
    for (const min of SNOOZE_OPTIONS) {
      setDefaultSnoozeMinutes(min);
      expect(getDefaultSnoozeMinutes()).toBe(min);
    }
  });

  it("throws on values outside SNOOZE_OPTIONS", () => {
    expect(() => setDefaultSnoozeMinutes(7)).toThrow();
    expect(() => setDefaultSnoozeMinutes(0)).toThrow();
    expect(() => setDefaultSnoozeMinutes(-5)).toThrow();
    // Nothing was persisted by the failed attempts
    expect(getDefaultSnoozeMinutes()).toBe(DEFAULT_SNOOZE_MINUTES);
  });

  it("falls back when storage holds a corrupt value", () => {
    storage.set(STORAGE_KEYS.SNOOZE_MINUTES, "garbage");
    expect(getDefaultSnoozeMinutes()).toBe(DEFAULT_SNOOZE_MINUTES);
    storage.set(STORAGE_KEYS.SNOOZE_MINUTES, "12"); // numeric but not an offered option
    expect(getDefaultSnoozeMinutes()).toBe(DEFAULT_SNOOZE_MINUTES);
  });
});
