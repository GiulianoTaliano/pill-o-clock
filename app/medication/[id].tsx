import { useState, useEffect } from "react";
import { Alert, View, ScrollView, Animated } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MedicationForm, MedicationFormValues } from "../../components/MedicationForm";
import { useAppStore } from "../../src/store";
import { getSchedulesByMedication } from "../../src/db/database";
import { Schedule } from "../../src/types";
import { useTranslation } from "../../src/i18n";
import { useSkeletonAnimation, SkeletonBox } from "../../components/Skeleton";

function MedicationFormSkeleton() {
  const anim = useSkeletonAnimation();
  const field = (widthPct = "100%") => (
    <View style={{ marginBottom: 20 }}>
      <SkeletonBox style={{ height: 12, width: "35%", borderRadius: 6, marginBottom: 8 }} />
      <SkeletonBox style={{ height: 44, width: widthPct, borderRadius: 12 }} />
    </View>
  );
  return (
    <Animated.View style={[anim, { flex: 1 }]}>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        scrollEnabled={false}
      >
        {/* Photo placeholder */}
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <SkeletonBox style={{ width: 80, height: 80, borderRadius: 40 }} />
        </View>
        {field()}
        {field()}
        {/* Category chips row */}
        <View style={{ marginBottom: 20 }}>
          <SkeletonBox style={{ height: 12, width: "30%", borderRadius: 6, marginBottom: 10 }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBox key={i} style={{ flex: 1, height: 34, borderRadius: 20 }} />
            ))}
          </View>
        </View>
        {field()}
        {/* Color swatches row */}
        <View style={{ marginBottom: 20 }}>
          <SkeletonBox style={{ height: 12, width: "25%", borderRadius: 6, marginBottom: 10 }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBox key={i} style={{ width: 32, height: 32, borderRadius: 16 }} />
            ))}
          </View>
        </View>
        {field()}
        {field()}
        {/* Schedule block */}
        <SkeletonBox style={{ height: 100, borderRadius: 16, marginBottom: 20 }} />
        {/* Submit button */}
        <SkeletonBox style={{ height: 50, borderRadius: 14, marginTop: 8 }} />
      </ScrollView>
    </Animated.View>
  );
}

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
    return <MedicationFormSkeleton />;
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
    isPRN: medication.isPRN,
    photoUri: medication.photoUri,
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
          isPRN: values.isPRN,
          photoUri: values.photoUri,
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
