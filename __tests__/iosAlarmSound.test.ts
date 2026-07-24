/**
 * Unit tests for the iOS alarm-sound preference.
 *
 * Android picks any ringtone on the device through the native module; iOS apps
 * cannot enumerate system tones, so the choice is limited to what is bundled.
 * These tests pin the persistence and, most importantly, the value handed to
 * expo-notifications — a wrong string there means a dose reminder that plays no
 * sound at all.
 */
import {
  getIosAlarmSound,
  setIosAlarmSound,
  resolveNotificationSound,
  BUNDLED_SOUND_FILE,
  IOS_ALARM_SOUNDS,
} from "../src/services/iosAlarmSound";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";

describe("iosAlarmSound", () => {
  beforeEach(() => {
    storage.remove(STORAGE_KEYS.IOS_ALARM_SOUND);
  });

  it("defaults to the bundled alarm", () => {
    expect(getIosAlarmSound()).toBe("bundled");
  });

  it("persists the choice", () => {
    setIosAlarmSound("system");
    expect(getIosAlarmSound()).toBe("system");

    setIosAlarmSound("bundled");
    expect(getIosAlarmSound()).toBe("bundled");
  });

  it("rejects unknown sounds", () => {
    expect(() => setIosAlarmSound("kazoo" as never)).toThrow();
  });

  // A value written by an older build (or a corrupted store) must not leave the
  // notification without a playable sound.
  it("falls back to the default on a garbage stored value", () => {
    storage.set(STORAGE_KEYS.IOS_ALARM_SOUND, "not-a-sound");
    expect(getIosAlarmSound()).toBe("bundled");
  });

  describe("resolveNotificationSound", () => {
    it("returns the bundled file name by default", () => {
      expect(resolveNotificationSound()).toBe(BUNDLED_SOUND_FILE);
    });

    // "default" is the exact string iOS understands as the standard tone;
    // anything else would be looked up as a (missing) bundled file.
    it("returns 'default' for the system sound", () => {
      setIosAlarmSound("system");
      expect(resolveNotificationSound()).toBe("default");
    });

    it("always resolves to a non-empty value for every option", () => {
      for (const sound of IOS_ALARM_SOUNDS) {
        setIosAlarmSound(sound);
        expect(resolveNotificationSound()).toBeTruthy();
      }
    });
  });
});
