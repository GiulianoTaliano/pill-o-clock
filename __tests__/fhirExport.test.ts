/**
 * FHIR R4 bundle builder (F3) — pure core.
 */
import { buildFhirBundle } from "../src/services/fhirExport";
import { makeMedication, makeSchedule } from "./factories";

jest.mock("../src/db/database", () => ({
  getActiveMedications: jest.fn(),
  getSchedulesByMedication: jest.fn(),
  getActiveAllergies: jest.fn(),
  getProfiles: jest.fn(),
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));

const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";

describe("buildFhirBundle", () => {
  const profile = {
    id: "default",
    name: "Mamá",
    color: "blue",
    createdAt: "2026-01-01",
    emergencyContactName: "Giuliano",
    emergencyContactPhone: "+54 9 11 5555-5555",
  };

  it("builds Patient + MedicationStatement + AllergyIntolerance entries", () => {
    const med = makeMedication({ id: "m1", name: "Enalapril", rxcui: "500", startDate: "2026-07-01" });
    const sched = makeSchedule({ medicationId: "m1", time: "08:00" });
    const bundle = buildFhirBundle(
      profile,
      "Mamá",
      [{ med, schedules: [sched] }],
      [{ id: "a1", name: "Penicilina", ingRxcui: "7980", createdAt: "2026-07-01" }],
      "2026-07-23T12:00:00.000Z"
    );

    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    const types = bundle.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType);
    expect(types).toEqual(["Patient", "MedicationStatement", "AllergyIntolerance"]);

    const patient = bundle.entry[0].resource as never as {
      name: { text: string }[];
      contact: { telecom: { value: string }[] }[];
    };
    expect(patient.name[0].text).toBe("Mamá");
    expect(patient.contact[0].telecom[0].value).toBe("+54 9 11 5555-5555");

    const stmt = bundle.entry[1].resource as never as {
      medicationCodeableConcept: { text: string; coding: { system: string; code: string }[] };
      dosage: { text: string }[];
      subject: { reference: string };
    };
    expect(stmt.medicationCodeableConcept.coding[0]).toEqual({ system: RXNORM, code: "500" });
    expect(stmt.dosage[0].text).toContain("08:00");
    expect(stmt.subject.reference).toBe("Patient/patient-1");

    const allergy = bundle.entry[2].resource as never as {
      code: { text: string; coding: { code: string }[] };
    };
    expect(allergy.code.text).toBe("Penicilina");
    expect(allergy.code.coding[0].code).toBe("7980");
  });

  it("marks PRN meds asNeeded and omits codings without rxcui", () => {
    const med = makeMedication({ id: "m1", name: "Ibuprofeno", isPRN: true, rxcui: undefined });
    const bundle = buildFhirBundle(null, "Yo", [{ med, schedules: [] }], [], "2026-07-23T12:00:00.000Z");
    const stmt = bundle.entry[1].resource as never as {
      dosage: { asNeededBoolean?: boolean }[];
      medicationCodeableConcept: { coding?: unknown };
    };
    expect(stmt.dosage[0].asNeededBoolean).toBe(true);
    expect(stmt.medicationCodeableConcept.coding).toBeUndefined();
  });
});
