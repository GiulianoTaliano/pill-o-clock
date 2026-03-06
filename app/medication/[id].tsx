import { useState, useEffect } from "react";
import { Alert, View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MedicationForm, MedicationFormValues } from "../../components/MedicationForm";
import { useAppStore } from "../../src/store";
import { getSchedulesByMedication } from "../../src/db/database";
import { Schedule } from "../../src/types";
import { useTranslation } from "../../src/i18n";

export default function EditMedicationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const medications = useAppStore((s) => s.medications);
  const updateMed = useAppStore((s) => s.updateMedication);
  // Exclude this medication's own name so renaming to the same name is allowed
  const existingNames = medications.filter((m) => m.id !== id).map((m) => m.name);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const medication = medications.find((m) => m.id === id);

  useEffect(() => {
    if (id) {
      getSchedulesByMedication(id)
        .then(setSchedules)
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading || !medication) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#4f9cff" />
      </View>
    );
  }

  const initialValues: MedicationFormValues = {
    name: medication.name,
    dosageAmount: medication.dosageAmount,
    dosageUnit: medication.dosageUnit,
    category: medication.category,
    notes: medication.notes ?? "",
    color: medication.color,
    startDate: medication.startDate,
    endDate: medication.endDate,
    stockQuantity: medication.stockQuantity,
    stockAlertThreshold: medication.stockAlertThreshold,
    schedules: schedules.map((s) => ({
      id: s.id,
      time: s.time,
      days: s.days,
    })),
  };

  const handleSubmit = async (values: MedicationFormValues) => {
    setSubmitting(true);
    try {
      await updateMed(
        {
          ...medication,
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
        },
        values.schedules.map((s) => ({ time: s.time, days: s.days }))
      );
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('form.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MedicationForm
      initialValues={initialValues}
      submitLabel={t('form.saveChanges')}
      isSubmitting={submitting}
      onSubmit={handleSubmit}
      existingNames={existingNames}
    />
  );
}
