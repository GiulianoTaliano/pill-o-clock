import { useState, useEffect, useRef } from "react";
import {
  Alert,
  View,
  ScrollView,
  Animated,
  Text,
  TouchableOpacity,
  type DimensionValue,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  MedicationForm,
  MedicationFormValues,
} from "../../components/MedicationForm";
import { useAppStore } from "../../src/store";
import { getSchedulesByMedication } from "../../src/db/database";
import { Schedule } from "../../src/types";
import { useTranslation } from "../../src/i18n";
import { reviewMedicationBeforeSave } from "../../src/services/medicationReview";
import { SavedMedicationError } from "../../src/store/slices/medications";
import { regimenAnchor } from "../../src/services/regimen";
import { useSkeletonAnimation, SkeletonBox } from "../../components/Skeleton";

function MedicationFormSkeleton() {
  const anim = useSkeletonAnimation();
  const field = (widthPct: DimensionValue = "100%") => (
    <View style={{ marginBottom: 20 }}>
      <SkeletonBox
        style={{ height: 12, width: "35%", borderRadius: 6, marginBottom: 8 }}
      />
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
          <SkeletonBox
            style={{
              height: 12,
              width: "30%",
              borderRadius: 6,
              marginBottom: 10,
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBox
                key={i}
                style={{ flex: 1, height: 34, borderRadius: 20 }}
              />
            ))}
          </View>
        </View>
        {field()}
        {/* Color swatches row */}
        <View style={{ marginBottom: 20 }}>
          <SkeletonBox
            style={{
              height: 12,
              width: "25%",
              borderRadius: 6,
              marginBottom: 10,
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBox
                key={i}
                style={{ width: 32, height: 32, borderRadius: 16 }}
              />
            ))}
          </View>
        </View>
        {field()}
        {field()}
        {/* Schedule block */}
        <SkeletonBox
          style={{ height: 100, borderRadius: 16, marginBottom: 20 }}
        />
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
  const existingNames = medications
    .filter((m) => m.id !== id)
    .map((m) => m.name);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const busy = useRef(false);
  const [retry, setRetry] = useState(0);

  const medication = medications.find((m) => m.id === id);

  useEffect(() => {
    if (id) {
      setLoading(true);
      setLoadError(false);
      getSchedulesByMedication(id)
        .then(setSchedules)
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [id, retry]);

  if (loading) {
    return <MedicationFormSkeleton />;
  }
  if (!medication || loadError)
    return (
      <View className="flex-1 bg-background items-center justify-center p-6">
        <Text className="text-lg text-text mb-4">
          {t(
            !medication ? "uxMedication.missing" : "uxMedication.operationError"
          )}
        </Text>
        {loadError && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setRetry((value) => value + 1)}
            className="bg-action rounded-xl p-4 mb-3"
          >
            <Text className="text-white font-bold">
              {t("uxMedication.retry")}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          className="p-4"
        >
          <Text className="text-primary font-bold">{t("common.back")}</Text>
        </TouchableOpacity>
      </View>
    );

  const initialValues: MedicationFormValues = {
    name: medication.name,
    dosageAmount: medication.dosageAmount,
    dosageUnit: medication.dosageUnit,
    category: medication.category,
    notes: medication.notes ?? "",
    color: medication.color,
    startDate:
      medication.startDate ??
      (medication.regimen ? regimenAnchor(medication) : undefined),
    endDate: medication.endDate,
    stockQuantity: medication.stockQuantity,
    stockAlertThreshold: medication.stockAlertThreshold,
    isPRN: medication.isPRN,
    photoUri: medication.photoUri,
    renewalDate: medication.renewalDate,
    prnMaxPerDay: medication.prnMaxPerDay,
    prnMinIntervalMinutes: medication.prnMinIntervalMinutes,
    rxcui: medication.rxcui,
    regimen: medication.regimen,
    isInjectable: medication.isInjectable,
    schedules: schedules.map((s) => ({
      id: s.id,
      time: s.time,
      days: s.days,
    })),
  };

  const handleSubmit = async (values: MedicationFormValues) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      if (
        !(await reviewMedicationBeforeSave(
          t,
          values,
          medications,
          medication.id
        ))
      )
        return;
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
          renewalDate: values.renewalDate,
          prnMaxPerDay: values.prnMaxPerDay,
          prnMinIntervalMinutes: values.prnMinIntervalMinutes,
          rxcui: values.rxcui,
          regimen: values.regimen,
          isInjectable: values.isInjectable,
        },
        // Pass each schedule's id through so unchanged schedules keep their
        // identity (and their dose_logs) instead of being deleted + recreated
        // with a fresh id (audit H17). New schedules added in the form carry a
        // local key that won't match any DB id, so they get a real id in the slice.
        values.schedules.map((s) => ({ id: s.id, time: s.time, days: s.days }))
      );
      return true;
    } catch (error) {
      if (error instanceof SavedMedicationError) {
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
      initialValues={initialValues}
      submitLabel={t("form.saveChanges")}
      isSubmitting={submitting}
      onSubmit={handleSubmit}
      onSaved={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      existingNames={existingNames}
    />
  );
}
