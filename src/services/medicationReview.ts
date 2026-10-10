import { Alert } from "react-native";
import { getActiveAllergies } from "../db/database";
import type { Medication } from "../types";
import {
  allergyConflictMessage,
  duplicateTherapyMessage,
  findAllergyConflicts,
  findDuplicateTherapy,
  ingredientKeysFor,
} from "./interactions";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Checks explain their coverage before any treatment or reminder is changed. */
export async function reviewMedicationBeforeSave(
  t: Translate,
  candidate: Pick<Medication, "name" | "rxcui">,
  others: Medication[],
  excludeId?: string
): Promise<boolean> {
  const observations: string[] = [];
  if (
    others.some(
      (med) =>
        med.id !== excludeId &&
        med.name.trim().toLocaleLowerCase() ===
          candidate.name.trim().toLocaleLowerCase()
    )
  )
    observations.push(t("form.errorDuplicateMsg", { name: candidate.name }));
  try {
    const conflicts = findAllergyConflicts(
      candidate,
      await getActiveAllergies()
    );
    const duplicate = findDuplicateTherapy(candidate, others, excludeId);
    if (conflicts.length)
      observations.push(allergyConflictMessage(t, conflicts));
    if (duplicate.length)
      observations.push(duplicateTherapyMessage(t, duplicate));
    if (!ingredientKeysFor(candidate).length)
      observations.push(t("uxMedication.checkUnknown"));
  } catch {
    observations.push(t("uxMedication.checkUnknown"));
  }
  if (!observations.length) return true;
  return new Promise((resolve) =>
    Alert.alert(
      t("uxMedication.observations"),
      observations.join("\n\n"),
      [
        {
          text: t("uxMedication.reviewEdit"),
          style: "cancel",
          onPress: () => resolve(false),
        },
        { text: t("uxMedication.saveAnyway"), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  );
}
