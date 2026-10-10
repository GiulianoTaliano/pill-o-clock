import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  MedicationForm,
  MedicationFormValues,
} from "../../components/MedicationForm";
import { useAppStore } from "../../src/store";
import { useTranslation } from "../../src/i18n";
import { reviewMedicationBeforeSave } from "../../src/services/medicationReview";
import { SavedMedicationError } from "../../src/store/slices/medications";
import {
  setupNotifications,
  rescheduleAllNotifications,
} from "../../src/services/notifications";
import { getReminderReadiness } from "../../src/services/reminderReadiness";

/**
 * Onboarding no longer asks for notification permission, so the first saved
 * schedule is the moment to ask — once, only while the system never asked.
 * Settings → Reminders stays the recovery path for every other state.
 */
async function askForRemindersOnce(): Promise<void> {
  try {
    if ((await getReminderReadiness()).notifications !== "notAsked") return;
    const { granted } = await setupNotifications();
    if (granted) await rescheduleAllNotifications();
  } catch {
    /* A failed prompt must not turn a saved medication into an error. */
  }
}

export default function NewMedicationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const addMedication = useAppStore((s) => s.addMedication);
  const medications = useAppStore((s) => s.medications);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const handleSubmit = async (values: MedicationFormValues) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      if (!(await reviewMedicationBeforeSave(t, values, medications))) return;
      await addMedication(
        {
          name: values.name,
          dosageAmount: values.dosageAmount,
          dosageUnit: values.dosageUnit,
          dosage: `${values.dosageAmount} ${values.dosageUnit}`,
          category: values.category,
          notes: values.notes || undefined,
          color: values.color,
          startDate: values.startDate,
          endDate: values.endDate,
          stockQuantity: values.stockQuantity,
          stockAlertThreshold: values.stockAlertThreshold,
          isPRN: values.isPRN,
          photoUri: values.photoUri,
          renewalDate: values.renewalDate,
          prnMaxPerDay: values.prnMaxPerDay,
          prnMinIntervalMinutes: values.prnMinIntervalMinutes,
          rxcui: values.rxcui,
          regimen: values.regimen,
          isInjectable: values.isInjectable,
        },
        values.schedules.map((s) => ({ time: s.time, days: s.days }))
      );
      if (!values.isPRN) await askForRemindersOnce();
      return true;
    } catch (error) {
      if (error instanceof SavedMedicationError) {
        if (!values.isPRN) await askForRemindersOnce();
        Alert.alert(
          t("uxMedication.saved"),
          t("uxMedication.notificationsPending")
        );
        return true;
      }
      Alert.alert(t("common.error"), t("form.errorGeneric"));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <MedicationForm
      submitLabel={t("uxMedication.save")}
      isSubmitting={submitting}
      onSubmit={handleSubmit}
      onSaved={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      existingNames={medications.map((m) => m.name)}
    />
  );
}
