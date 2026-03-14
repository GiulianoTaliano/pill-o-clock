/**
 * __tests__/schemas/medicationSchema.test.ts
 * Tests for the Zod medication form schema.
 */

import { medicationFormSchema, type MedicationFormData } from "../../src/schemas/medication";

// ─── Helpers ───────────────────────────────────────────────────────────────

function validData(overrides: Partial<MedicationFormData> = {}): MedicationFormData {
  return {
    name: "Ibuprofeno",
    dosageAmount: "400",
    dosageUnit: "mg",
    category: "analgesico",
    notes: "",
    color: "blue",
    repeatMode: "repeat",
    schedules: [{ id: "s1", time: "08:00", days: [1, 3, 5] }],
    stockQtyStr: "",
    stockThreshStr: "",
    ...overrides,
  } as MedicationFormData;
}

function parseErrors(data: unknown) {
  const result = medicationFormSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

// ─── Happy path ────────────────────────────────────────────────────────────

describe("medicationFormSchema", () => {
  it("accepts valid repeat-mode data", () => {
    const result = medicationFormSchema.safeParse(validData());
    expect(result.success).toBe(true);
  });

  it("accepts valid once-mode data", () => {
    const result = medicationFormSchema.safeParse(
      validData({
        repeatMode: "once",
        onceDate: "2026-03-14",
        schedules: [{ id: "s1", time: "09:00", days: [] }],
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts PRN mode with no schedules", () => {
    const result = medicationFormSchema.safeParse(
      validData({ repeatMode: "prn", schedules: [] })
    );
    expect(result.success).toBe(true);
  });

  it("accepts comma-decimal dosage (e.g. '1,5')", () => {
    const result = medicationFormSchema.safeParse(validData({ dosageAmount: "1,5" }));
    expect(result.success).toBe(true);
  });

  // ─── Name validation ──────────────────────────────────────────────────

  it("rejects empty name", () => {
    const errors = parseErrors(validData({ name: "" }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "name", message: "form.errorNameRequiredMsg" }),
      ])
    );
  });

  it("rejects whitespace-only name", () => {
    const errors = parseErrors(validData({ name: "   " }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "name", message: "form.errorNameRequiredMsg" }),
      ])
    );
  });

  // ─── Dosage validation ────────────────────────────────────────────────

  it("rejects empty dosage", () => {
    const errors = parseErrors(validData({ dosageAmount: "" }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "dosageAmount", message: "form.errorDoseRequiredMsg" }),
      ])
    );
  });

  it("rejects non-numeric dosage", () => {
    const errors = parseErrors(validData({ dosageAmount: "abc" }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "dosageAmount", message: "form.errorDoseRequiredMsg" }),
      ])
    );
  });

  it("rejects zero dosage", () => {
    const errors = parseErrors(validData({ dosageAmount: "0" }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "dosageAmount", message: "form.errorDoseRequiredMsg" }),
      ])
    );
  });

  it("rejects negative dosage", () => {
    const errors = parseErrors(validData({ dosageAmount: "-5" }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "dosageAmount", message: "form.errorDoseRequiredMsg" }),
      ])
    );
  });

  // ─── Schedule validation ──────────────────────────────────────────────

  it("rejects empty schedules in repeat mode", () => {
    const errors = parseErrors(validData({ repeatMode: "repeat", schedules: [] }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "schedules", message: "form.errorNoAlarmsMsg" }),
      ])
    );
  });

  it("rejects empty schedules in once mode", () => {
    const errors = parseErrors(
      validData({ repeatMode: "once", onceDate: "2026-03-14", schedules: [] })
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "schedules", message: "form.errorNoAlarmsMsg" }),
      ])
    );
  });

  it("rejects invalid time format in schedule", () => {
    const errors = parseErrors(
      validData({ schedules: [{ id: "s1", time: "8:00", days: [] }] })
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid day number in schedule", () => {
    const errors = parseErrors(
      validData({ schedules: [{ id: "s1", time: "08:00", days: [7] }] })
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  // ─── Date range validation ────────────────────────────────────────────

  it("rejects end date before start date in repeat mode", () => {
    const errors = parseErrors(
      validData({ repeatMode: "repeat", startDate: "2026-03-15", endDate: "2026-03-10" })
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "endDate", message: "form.errorInvalidPeriodMsg" }),
      ])
    );
  });

  it("accepts end date equal to start date", () => {
    const result = medicationFormSchema.safeParse(
      validData({ repeatMode: "repeat", startDate: "2026-03-15", endDate: "2026-03-15" })
    );
    expect(result.success).toBe(true);
  });

  // ─── Enum validation ─────────────────────────────────────────────────

  it("rejects invalid dosage unit", () => {
    const errors = parseErrors(validData({ dosageUnit: "invalid" as any }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid category", () => {
    const errors = parseErrors(validData({ category: "invalid" as any }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid repeat mode", () => {
    const errors = parseErrors(validData({ repeatMode: "invalid" as any }));
    expect(errors.length).toBeGreaterThan(0);
  });

  // ─── Optional fields ─────────────────────────────────────────────────

  it("accepts data without optional fields", () => {
    const data = validData();
    delete (data as any).startDate;
    delete (data as any).endDate;
    delete (data as any).onceDate;
    delete (data as any).photoUri;
    const result = medicationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("defaults notes to empty string", () => {
    const data = validData();
    delete (data as any).notes;
    const result = medicationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("");
    }
  });

  it("defaults stockQtyStr to empty string", () => {
    const data = validData();
    delete (data as any).stockQtyStr;
    const result = medicationFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stockQtyStr).toBe("");
    }
  });
});
