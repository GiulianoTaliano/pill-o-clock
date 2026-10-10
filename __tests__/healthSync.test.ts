/**
 * Unit tests for the Health Connect record mapping (F2).
 */
import { buildHealthConnectRecord, syncMeasurementToHealthConnect, enableHealthSync, getHealthSyncPermissionStatus } from "../src/services/healthSync";
import { HealthMeasurement } from "../src/types";
import { Platform } from "react-native";
import * as HealthConnect from "react-native-health-connect";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";
import { setActiveProfileId } from "../src/services/profileStore";

jest.mock("react-native-health-connect", () => ({
  initialize: jest.fn().mockResolvedValue(true), requestPermission: jest.fn().mockResolvedValue([]),
  getGrantedPermissions: jest.fn().mockResolvedValue([{ accessType: "write", recordType: "Weight" }]),
  insertRecords: jest.fn().mockResolvedValue([]),
}));

const m = (over: Partial<HealthMeasurement>): HealthMeasurement => ({
  id: "h1",
  type: "weight",
  value1: 70,
  measuredAt: "2026-07-22T10:00:00.000Z",
  createdAt: "2026-07-22T10:00:00.000Z",
  ...over,
});

describe("Health Connect owner boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    storage.set(STORAGE_KEYS.HEALTH_SYNC, "1"); setActiveProfileId("default");
    jest.mocked(HealthConnect.getGrantedPermissions).mockResolvedValue([{ accessType: "write", recordType: "Weight" }] as never);
  });
  it("never sends another person's reading even when the main person is now selected", async () => {
    await syncMeasurementToHealthConnect(m({ profileId: "daughter" }));
    await syncMeasurementToHealthConnect(m({})); // legacy/ambiguous owner cannot be guessed
    expect(HealthConnect.insertRecords).not.toHaveBeenCalled();
  });
  it("sends an explicitly owned measurement even if another profile was selected meanwhile", async () => {
    setActiveProfileId("daughter");
    await syncMeasurementToHealthConnect(m({ profileId: "default" }));
    expect(HealthConnect.insertRecords).toHaveBeenCalledTimes(1);
  });
  it("checks the permission for the specific reading before a push", async () => {
    await syncMeasurementToHealthConnect(m({ type: "glucose", profileId: "default" }));
    expect(HealthConnect.insertRecords).not.toHaveBeenCalled();
    jest.mocked(HealthConnect.getGrantedPermissions).mockResolvedValue([]);
    await syncMeasurementToHealthConnect(m({ profileId: "default" }));
    expect(HealthConnect.insertRecords).not.toHaveBeenCalled();
  });
  it("does not let a dependent profile opt in on behalf of the device owner", async () => {
    setActiveProfileId("daughter");
    expect(await enableHealthSync()).toBe(false);
    expect(HealthConnect.requestPermission).not.toHaveBeenCalled();
  });
  it("shows partial and revoked permissions instead of trusting stored opt-in", async () => {
    expect(await getHealthSyncPermissionStatus()).toBe("partial");
    jest.mocked(HealthConnect.getGrantedPermissions).mockResolvedValue([]);
    expect(await getHealthSyncPermissionStatus()).toBe("denied");
    jest.mocked(HealthConnect.getGrantedPermissions).mockRejectedValueOnce(new Error("native"));
    expect(await getHealthSyncPermissionStatus()).toBe("error");
  });
});

describe("buildHealthConnectRecord", () => {
  it("maps blood pressure with both values in mmHg", () => {
    const r = buildHealthConnectRecord(m({ type: "blood_pressure", value1: 120, value2: 80 }))!;
    expect(r.recordType).toBe("BloodPressure");
    expect(r.systolic).toEqual({ value: 120, unit: "millimetersOfMercury" });
    expect(r.diastolic).toEqual({ value: 80, unit: "millimetersOfMercury" });
  });

  it("rejects blood pressure without diastolic", () => {
    expect(buildHealthConnectRecord(m({ type: "blood_pressure", value1: 120 }))).toBeNull();
  });

  it("maps glucose in mg/dL with unknown context fields", () => {
    const r = buildHealthConnectRecord(m({ type: "glucose", value1: 95 }))!;
    expect(r.recordType).toBe("BloodGlucose");
    expect(r.level).toEqual({ value: 95, unit: "milligramsPerDeciliter" });
    expect(r.specimenSource).toBe(0);
  });

  it("maps weight in kilograms", () => {
    const r = buildHealthConnectRecord(m({ type: "weight", value1: 70.5 }))!;
    expect(r.weight).toEqual({ value: 70.5, unit: "kilograms" });
  });

  it("maps SpO2 as a percentage", () => {
    const r = buildHealthConnectRecord(m({ type: "spo2", value1: 97 }))!;
    expect(r).toMatchObject({ recordType: "OxygenSaturation", percentage: 97 });
  });

  it("maps heart rate as a 1-second interval series with one sample", () => {
    const r = buildHealthConnectRecord(m({ type: "heart_rate", value1: 68 }))!;
    expect(r.recordType).toBe("HeartRate");
    expect(r.startTime).toBe("2026-07-22T10:00:00.000Z");
    expect(r.endTime).toBe("2026-07-22T10:00:01.000Z");
    expect(r.samples).toEqual([{ time: "2026-07-22T10:00:00.000Z", beatsPerMinute: 68 }]);
  });
});
