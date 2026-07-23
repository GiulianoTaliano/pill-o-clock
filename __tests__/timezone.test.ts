/**
 * Timezone-change detection (F3 travel reliability).
 */
import { detectTimezoneChange, getDeviceTimezone } from "../src/services/timezone";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";

beforeEach(() => {
  storage.delete(STORAGE_KEYS.LAST_TIMEZONE);
});

describe("detectTimezoneChange", () => {
  it("first run persists but never reports a change", () => {
    const r = detectTimezoneChange("America/Argentina/Buenos_Aires");
    expect(r.changed).toBe(false);
    expect(storage.getString(STORAGE_KEYS.LAST_TIMEZONE)).toBe("America/Argentina/Buenos_Aires");
  });

  it("same zone → no change", () => {
    detectTimezoneChange("America/Argentina/Buenos_Aires");
    expect(detectTimezoneChange("America/Argentina/Buenos_Aires").changed).toBe(false);
  });

  it("different zone → change with from/to, and persists the new zone", () => {
    detectTimezoneChange("America/Argentina/Buenos_Aires");
    const r = detectTimezoneChange("Europe/Madrid");
    expect(r).toEqual({
      changed: true,
      from: "America/Argentina/Buenos_Aires",
      to: "Europe/Madrid",
    });
    // Next check from Madrid is stable again.
    expect(detectTimezoneChange("Europe/Madrid").changed).toBe(false);
  });

  it("getDeviceTimezone returns something usable", () => {
    expect(getDeviceTimezone()).toBeTruthy();
  });
});
