import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { MedicationForm, MedicationFormValues } from "../../components/MedicationForm";
import { useAppStore } from "../../src/store";
import { useTranslation } from "../../src/i18n";
import { findDuplicateTherapy, duplicateTherapyMessage } from "../../src/services/interactions";

export default function NewMedicationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const addMedication = useAppStore((s) => s.addMedication);
  const medications = useAppStore((s) => s.medications);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: MedicationFormValues) => {
    setSubmitting(true);
    try {
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
        },
        values.schedules.map((s) => ({ time: s.time, days: s.days }))
      );
      // Duplicate-therapy check (F2): informational, after a successful save.
      const dupes = findDuplicateTherapy(values.rxcui, medications);
      if (dupes.length > 0) {
        Alert.alert(
          t('interactions.dupTitle'),
          duplicateTherapyMessage(t, dupes),
          [{ text: t('common.ok'), onPress: () => router.back() }]
        );
        return;
      }
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('form.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MedicationForm
      submitLabel={t('form.addButton')}
      isSubmitting={submitting}
      onSubmit={handleSubmit}
      existingNames={medications.map((m) => m.name)}
    />
  );
}
