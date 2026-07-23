/**
 * Unit tests for the Health Connect record mapping (F2).
 */
import { buildHealthConnectRecord } from "../src/services/healthSync";
import { HealthMeasurement } from "../src/types";

const m = (over: Partial<HealthMeasurement>): HealthMeasurement => ({
  id: "h1",
  type: "weight",
  value1: 70,
  measuredAt: "2026-07-22T10:00:00.000Z",
  createdAt: "2026-07-22T10:00:00.000Z",
  ...over,
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
