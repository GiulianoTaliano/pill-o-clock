/**
 * FHIR R4 export (F3): a `Bundle` (type "collection") with the active
 * profile's Patient, MedicationStatement per active med, and
 * AllergyIntolerance per recorded allergy — the interop format clinics and
 * national health records actually consume. Shared as a JSON file via the
 * share-sheet; 100% local, generated on demand.
 *
 * Scope note: read-only EXPORT. Live SMART-on-FHIR connectivity is an
 * explicit non-goal (see product backlog).
 */
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import {
  getActiveMedications,
  getSchedulesByMedication,
  getActiveAllergies,
  getProfiles,
} from "../db/database";
import { getActiveProfileId } from "./profileStore";
import i18n from "../i18n";
import type { Allergy, Medication, Profile, Schedule } from "../types";

function t(key: string): string {
  return i18n.t(key) as string;
}

/** RxNorm system URI — our rxcui field is an RxNorm SXDG id. */
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";

function patientResource(profile: Profile | null, displayName: string) {
  return {
    resourceType: "Patient",
    id: "patient-1",
    name: [{ text: displayName }],
    ...(profile?.emergencyContactPhone
      ? {
          contact: [
            {
              name: { text: profile.emergencyContactName ?? "" },
              telecom: [{ system: "phone", value: profile.emergencyContactPhone }],
            },
          ],
        }
      : {}),
  };
}

function medicationStatementResource(med: Medication, schedules: Schedule[], index: number) {
  const timings = schedules.filter((s) => s.isActive).map((s) => s.time);
  return {
    resourceType: "MedicationStatement",
    id: `medstmt-${index}`,
    status: "active",
    subject: { reference: "Patient/patient-1" },
    medicationCodeableConcept: {
      text: med.name,
      ...(med.rxcui ? { coding: [{ system: RXNORM, code: med.rxcui }] } : {}),
    },
    ...(med.startDate ? { effectivePeriod: { start: med.startDate, ...(med.endDate ? { end: med.endDate } : {}) } } : {}),
    dosage: [
      {
        text: med.isPRN
          ? `${med.dosage} — ${t("fhir.prn")}`
          : `${med.dosage}${timings.length ? ` — ${timings.join(", ")}` : ""}`,
        ...(med.isPRN ? { asNeededBoolean: true } : {}),
      },
    ],
    ...(med.notes ? { note: [{ text: med.notes }] } : {}),
  };
}

function allergyResource(allergy: Allergy, index: number) {
  return {
    resourceType: "AllergyIntolerance",
    id: `allergy-${index}`,
    patient: { reference: "Patient/patient-1" },
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    },
    code: {
      text: allergy.name,
      ...(allergy.ingRxcui ? { coding: [{ system: RXNORM, code: allergy.ingRxcui }] } : {}),
    },
  };
}

/** Pure builder — testable without native modules. */
export function buildFhirBundle(
  profile: Profile | null,
  displayName: string,
  meds: { med: Medication; schedules: Schedule[] }[],
  allergies: Allergy[],
  generatedAt: string
) {
  const entries = [
    { resource: patientResource(profile, displayName) },
    ...meds.map((m, i) => ({ resource: medicationStatementResource(m.med, m.schedules, i + 1) })),
    ...allergies.map((a, i) => ({ resource: allergyResource(a, i + 1) })),
  ];
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: generatedAt,
    entry: entries,
  };
}

export async function generateAndShareFhirBundle(): Promise<void> {
  const [profiles, meds, allergies] = await Promise.all([
    getProfiles(),
    getActiveMedications(),
    getActiveAllergies(),
  ]);
  const profile = profiles.find((p) => p.id === getActiveProfileId()) ?? null;
  const displayName = profile?.name || (i18n.t("profiles.me") as string);

  const activeMeds = meds.filter((m) => m.isActive);
  const withSchedules = [];
  for (const med of activeMeds) {
    withSchedules.push({ med, schedules: await getSchedulesByMedication(med.id) });
  }

  const bundle = buildFhirBundle(
    profile,
    displayName,
    withSchedules,
    allergies,
    new Date().toISOString()
  );

  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `pilloclock-fhir-${date}.json`);
  try {
    file.write(JSON.stringify(bundle, null, 2));
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/fhir+json",
      dialogTitle: t("fhir.shareTitle"),
    });
  } finally {
    // Health data must not linger in cache (audit L8). Best-effort.
    try {
      file.delete();
    } catch {
      /* ignore */
    }
  }
}
