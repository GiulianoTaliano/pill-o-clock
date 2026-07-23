import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useState, useRef, useCallback, Fragment } from "react";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Medication, DosageUnit, MedicationCategory } from "../src/types";
import { ColorPicker } from "./ColorPicker";
import { DayToggle } from "./DayToggle";
import { format } from "date-fns";
import { DOSAGE_UNITS, CATEGORY_CONFIG, getCategoryLabel, getDosageLabel, formatTimeForDisplay } from "../src/utils";
import { useTranslation } from "../src/i18n";
import * as Haptics from "expo-haptics";
import { useToast } from "../src/context/ToastContext";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { medicationFormSchema, type MedicationFormData } from "../src/schemas/medication";
import { searchDrugs, type DrugSuggestion } from "../src/services/drugDb";
import { useAppTheme } from "../src/hooks/useAppTheme";

// ─── Inline error ──────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text className="text-danger text-xs mt-1">{message}</Text>;
}
// ─── Tip block ──────────────────────────────────────────────────────────────────────

function TipBlock({ text, theme }: { text: string; theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View className="flex-row items-start gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5 mb-4">
      <Ionicons name="information-circle-outline" size={16} color={theme.primary} style={{ marginTop: 1 }} />
      <Text className="text-sm text-muted flex-1 leading-5">{text}</Text>
    </View>
  );
}
// ─── Step indicator ────────────────────────────────────────────────────────

interface StepIndicatorProps {
  current: number;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <View className="flex-row items-center justify-center px-8 py-4 gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <Fragment key={i}>
          <View
            className={`w-3 h-3 rounded-full ${
              i < current
                ? "bg-primary"
                : i === current
                  ? "bg-primary"
                  : "bg-border"
            }`}
            style={i === current ? { borderWidth: 2, borderColor: "rgba(79,156,255,0.4)" } : undefined}
          />
          {i < total - 1 && (
            <View
              className={`flex-1 h-0.5 ${
                i < current ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </Fragment>
      ))}
    </View>
  );
}

// ─── Schedule row ──────────────────────────────────────────────────────────

interface ScheduleInput {
  id: string; // local key only
  time: string; // HH:mm
  days: number[];
}

interface ScheduleRowProps {
  schedule: ScheduleInput;
  onRemove: () => void;
  onChange: (s: ScheduleInput) => void;
  /** When false the days picker is hidden (used in "Única vez" mode) */
  showDays?: boolean;
}

function ScheduleRow({ schedule, onRemove, onChange, showDays = true }: ScheduleRowProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [showPicker, setShowPicker] = useState(false);

  const timeDate = (() => {
    const [h, m] = schedule.time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  })();

  const handleTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowPicker(Platform.OS === "ios");
    if (date) {
      onChange({ ...schedule, time: format(date, "HH:mm") });
    }
  };

  return (
    <View className="bg-card-alt rounded-2xl p-4 mb-3 border border-border">
      {/* Time */}
      <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-semibold text-text">{t('form.fieldTime')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${t('form.fieldTime')} ${formatTimeForDisplay(schedule.time)}`}
          onPress={() => setShowPicker(true)}
          className="flex-row items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 min-h-[44px]"
        >
          <Ionicons name="alarm-outline" size={16} color={theme.primary} />
          <Text className="text-base font-bold text-primary">{formatTimeForDisplay(schedule.time)}</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={timeDate}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleTimeChange}
        />
      )}

      {/* Days */}
      {showDays && (
        <>
          <Text className="text-sm font-semibold text-text mb-2">{t('form.fieldDays')}</Text>
          <DayToggle
            selectedDays={schedule.days}
            onChange={(days) => onChange({ ...schedule, days })}
          />
        </>
      )}

      {/* Remove */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('form.removeAlarm')}
        onPress={onRemove}
        className="flex-row items-center gap-1 mt-3 self-end min-h-[44px] px-2"
      >
        <Ionicons name="trash-outline" size={14} color={theme.danger} />
        <Text className="text-red-700 dark:text-red-400 text-xs font-semibold">{t('form.removeAlarm')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Date selector row ─────────────────────────────────────────────────────

interface DateRowProps {
  label: string;
  value?: string; // YYYY-MM-DD
  onChange: (val?: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

function DateRow({ label, value, onChange, minimumDate, maximumDate }: DateRowProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [show, setShow] = useState(false);

  const dateObj = value ? new Date(value + "T12:00") : (minimumDate ?? new Date());

  const handleOpen = () => {
    if (!value) {
      const fallback = minimumDate ?? new Date();
      onChange(format(fallback, "yyyy-MM-dd"));
    }
    setShow(true);
  };

  const handleChange = (_: DateTimePickerEvent, date?: Date) => {
    setShow(Platform.OS === "ios");
    if (date) {
      onChange(format(date, "yyyy-MM-dd"));
    }
  };

  return (
    <View className="py-2.5">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-text">{label}</Text>
        {value && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('form.clearDate')}
            onPress={() => { onChange(undefined); setShow(false); }}
            className="items-center justify-center"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Ionicons name="close-circle" size={16} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        onPress={handleOpen}
        className="flex-row items-center gap-2 bg-card-alt border border-border rounded-xl px-3 py-2.5"
      >
        <Ionicons name="calendar-outline" size={14} color={theme.primary} />
        <Text className={`text-sm font-semibold ${value ? "text-text" : "text-muted"}`}>
          {value
            ? format(new Date(value + "T12:00"), "dd/MM/yyyy")
            : t('form.selectDate')}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

// ─── Main Form ─────────────────────────────────────────────────────────────

export interface MedicationFormValues {
  name: string;
  dosageAmount: number;
  dosageUnit: DosageUnit;
  category: MedicationCategory;
  notes: string;
  color: Medication["color"];
  startDate?: string;
  endDate?: string;
  schedules: ScheduleInput[];
  stockQuantity?: number;
  stockAlertThreshold?: number;
  isPRN?: boolean;
  photoUri?: string;
  /** ISO date (YYYY-MM-DD) — optional prescription-renewal date. */
  renewalDate?: string;
}

interface MedicationFormProps {
  initialValues?: MedicationFormValues;
  /** Names of existing medications for duplicate-name validation.
   *  When editing, exclude the current med's own name from this list. */
  existingNames?: string[];
  onSubmit: (values: MedicationFormValues) => Promise<void>;
  submitLabel: string;
  isSubmitting: boolean;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function newSchedule(): ScheduleInput {
  return {
    id: String(Date.now()),
    time: "08:00",
    days: ALL_DAYS,
  };
}

/** Normalize days: empty array (DB convention for "daily") → explicit all days for UI */
function normalizeScheduleDays(s: ScheduleInput): ScheduleInput {
  return s.days.length === 0 ? { ...s, days: ALL_DAYS } : s;
}

// ─── Per-slide field mapping for validation ─────────────────────────────────

// Keyed by LOGICAL slide index. The cosmetic Appearance slide is last so the
// required fields come first and the optional/cosmetic steps trail (audit UX
// I13): 0 Identity · 1 Frequency · 2 Alarms · 3 Extras · 4 Appearance.
const SLIDE_FIELDS: Record<number, (keyof MedicationFormData)[]> = {
  0: ["name", "dosageAmount", "dosageUnit", "category"],
  1: ["repeatMode"],
  2: ["schedules"],
  3: [],
  4: [],
};

export function MedicationForm({
  initialValues,
  existingNames = [],
  onSubmit,
  submitLabel,
  isSubmitting,
}: MedicationFormProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const isEditMode = !!initialValues;

  // ─ Frecuencia ────────────────────────────────────────────────────────────
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isInitiallyOnce = !!(
    initialValues?.startDate && initialValues.startDate === initialValues.endDate
  );

  const { control, handleSubmit: rhfHandleSubmit, watch, setValue, trigger, formState: { errors } } = useForm<MedicationFormData>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      dosageAmount: initialValues?.dosageAmount != null ? String(initialValues.dosageAmount) : "",
      dosageUnit: initialValues?.dosageUnit ?? "comprimidos",
      category: initialValues?.category ?? "otro",
      notes: initialValues?.notes ?? "",
      color: initialValues?.color ?? "blue",
      repeatMode: initialValues?.isPRN ? "prn" : isInitiallyOnce ? "once" : "repeat",
      onceDate: isInitiallyOnce ? (initialValues?.startDate ?? todayStr) : todayStr,
      startDate: initialValues?.startDate,
      endDate: initialValues?.endDate,
      schedules: initialValues?.schedules?.length ? initialValues.schedules.map(normalizeScheduleDays) : [newSchedule()],
      stockQtyStr: initialValues?.stockQuantity != null ? String(initialValues.stockQuantity) : "",
      stockThreshStr: initialValues?.stockAlertThreshold != null ? String(initialValues.stockAlertThreshold) : "",
      photoUri: initialValues?.photoUri,
      renewalDate: initialValues?.renewalDate,
    },
  });

  const { fields: scheduleFields, append: appendSchedule, remove: removeScheduleAt } = useFieldArray({
    control,
    name: "schedules",
  });

  const dosageUnit = watch("dosageUnit");
  const category = watch("category");
  const color = watch("color");
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const stockQtyStr = watch("stockQtyStr");
  const stockThreshStr = watch("stockThreshStr");

  // Offline drug-name autocomplete (F1). Cleared on pick or when too short.
  const [drugSuggestions, setDrugSuggestions] = useState<DrugSuggestion[]>([]);
  const photoUri = watch("photoUri");
  const repeatMode = watch("repeatMode");
  const onceDate = watch("onceDate");
  const watchedSchedules = watch("schedules");

  const isPRN = repeatMode === "prn";
  const totalSlides = isPRN ? 4 : 5;

  // Map visual slide index to logical slide index.
  // When PRN, the Alarms slide (logical 2) is dropped, so the visual sequence
  // [Identity, Frequency, Extras, Appearance] = visual [0,1,2,3] maps to
  // logical [0,1,3,4].
  const getLogicalSlide = useCallback((visualIdx: number) => {
    if (!isPRN) return visualIdx;
    return visualIdx >= 2 ? visualIdx + 1 : visualIdx;
  }, [isPRN]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast(t('form.errorPhotoPermission'), "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setValue("photoUri", result.assets[0].uri);
    }
  };

  const { showToast } = useToast();

  const handleFormSubmit = async (data: MedicationFormData) => {
    const trimmedName = data.name.trim().toLowerCase();
    if (existingNames.some((n) => n.toLowerCase() === trimmedName)) {
      showToast(t('form.errorDuplicateMsg', { name: data.name.trim() }), "error");
      return;
    }
    const parsedAmount = parseFloat(data.dosageAmount.replace(",", "."));

    await onSubmit({
      name: data.name.trim(),
      dosageAmount: parsedAmount,
      dosageUnit: data.dosageUnit,
      category: data.category,
      notes: (data.notes ?? "").trim(),
      color: data.color,
      startDate: data.repeatMode === "once" ? data.onceDate : data.repeatMode === "prn" ? undefined : data.startDate,
      endDate:   data.repeatMode === "once" ? data.onceDate : data.repeatMode === "prn" ? undefined : data.endDate,
      schedules: data.repeatMode === "prn" ? [] : data.schedules.map((s) => {
        const days = data.repeatMode === "once" || s.days.length === 7 ? [] : s.days;
        return { ...s, days };
      }),
      stockQuantity: data.stockQtyStr?.trim() ? Math.max(0, parseInt(data.stockQtyStr, 10)) : undefined,
      stockAlertThreshold: data.stockThreshStr?.trim() ? Math.max(0, parseInt(data.stockThreshStr, 10)) : undefined,
      isPRN: data.repeatMode === "prn",
      photoUri: data.photoUri,
      renewalDate: data.renewalDate,
    });
  };

  const handleValidationError = () => {
    const firstError = Object.values(errors)[0];
    if (firstError?.message) {
      showToast(t(firstError.message as any), "error");
    }
  };

  const updateSchedule = (idx: number, s: ScheduleInput) => {
    setValue(`schedules.${idx}`, s);
  };

  const removeSchedule = (idx: number) => {
    if (scheduleFields.length === 1) {
      showToast(t('form.errorNoAlarmsMsg'), "error");
      return;
    }
    removeScheduleAt(idx);
  };

  // ─── Wizard navigation ─────────────────────────────────────────────────

  const scrollToSlide = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const goNext = useCallback(async () => {
    if (currentSlide >= totalSlides - 1) return;

    // In edit mode, skip validation when navigating forward
    if (!isEditMode) {
      const logicalSlide = getLogicalSlide(currentSlide);
      const fields = SLIDE_FIELDS[logicalSlide] ?? [];
      if (fields.length > 0) {
        const valid = await trigger(fields);
        if (!valid) {
          const firstError = Object.values(errors)[0];
          if (firstError?.message) {
            showToast(t(firstError.message as any), "error");
          }
          return;
        }
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = currentSlide + 1;
    setCurrentSlide(next);
    scrollToSlide(next);
  }, [currentSlide, totalSlides, isEditMode, getLogicalSlide, trigger, errors, showToast, t, scrollToSlide]);

  const goBack = useCallback(() => {
    if (currentSlide <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prev = currentSlide - 1;
    setCurrentSlide(prev);
    scrollToSlide(prev);
  }, [currentSlide, scrollToSlide]);

  const handleSkip = useCallback(() => {
    if (currentSlide >= totalSlides - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = currentSlide + 1;
    setCurrentSlide(next);
    scrollToSlide(next);
  }, [currentSlide, totalSlides, scrollToSlide]);

  const handleSubmitPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rhfHandleSubmit(handleFormSubmit, handleValidationError)();
  }, [rhfHandleSubmit, handleFormSubmit, handleValidationError]);

  const handleSkipAndSave = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rhfHandleSubmit(handleFormSubmit, handleValidationError)();
  }, [rhfHandleSubmit, handleFormSubmit, handleValidationError]);

  const isLastSlide = currentSlide === totalSlides - 1;
  const logicalCurrent = getLogicalSlide(currentSlide);
  // Extras (3) and Appearance (4) are the two optional slides.
  const canSkip = logicalCurrent === 3 || logicalCurrent === 4;

  // ─── Slide contents ─────────────────────────────────────────────────────

  function SlideIdentity() {
    return (
      <ScrollView style={{ width: screenWidth }} showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">{t('wizard.slideIdentityTitle')}</Text>
          <Text className="text-sm text-muted mb-5">{t('wizard.slideIdentitySubtitle')}</Text>

          <View className="bg-card rounded-2xl border border-border p-4 gap-4">
            {/* Name */}
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">
                {t('form.fieldName')} <Text className="text-danger">{t('common.required')}</Text>
              </Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={(v) => {
                      onChange(v);
                      setDrugSuggestions(searchDrugs(v));
                    }}
                    placeholder={t('form.fieldNamePlaceholder')}
                    placeholderTextColor={theme.muted}
                    className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
                    autoCapitalize="words"
                  />
                )}
              />
              {drugSuggestions.length > 0 && (
                <View className="mt-1 rounded-xl border border-border bg-card overflow-hidden">
                  {drugSuggestions.map((s) => (
                    <TouchableOpacity
                      key={s.name}
                      accessibilityRole="button"
                      accessibilityLabel={s.name}
                      onPress={() => {
                        setValue("name", s.name, { shouldValidate: true });
                        setDrugSuggestions([]);
                      }}
                      className="px-3 py-2.5 border-b border-border"
                    >
                      <Text className="text-sm font-medium text-text" numberOfLines={1}>{s.name}</Text>
                      {s.strengths.length > 0 && (
                        <Text className="text-[11px] text-muted mt-0.5" numberOfLines={1}>
                          {s.strengths.slice(0, 6).join(" · ")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                  <Text className="px-3 py-1.5 text-[10px] text-muted">{t('form.drugDbAttribution')}</Text>
                </View>
              )}
              <FieldError message={errors.name?.message ? t(errors.name.message as any) : undefined} />
            </View>

            {/* Dosage */}
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">
                {t('form.fieldDose')} <Text className="text-danger">{t('common.required')}</Text>
              </Text>
              <View className="flex-row items-center gap-2 mb-2">
                <Controller
                  control={control}
                  name="dosageAmount"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      placeholder={t('form.fieldDoseAmountPlaceholder')}
                      placeholderTextColor={theme.muted}
                      keyboardType="decimal-pad"
                      className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                    />
                  )}
                />
                <Text className="text-muted text-sm">{t('form.fieldDoseAmountLabel')}</Text>
              </View>
              <FieldError message={errors.dosageAmount?.message ? t(errors.dosageAmount.message as any) : undefined} />
              <Text className="text-xs text-muted mt-1 mb-1">{t('form.doseHint')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2 pb-1">
                  {DOSAGE_UNITS.map((u) => (
                    <TouchableOpacity
                      key={u.value}
                      onPress={() => setValue("dosageUnit", u.value)}
                      className={`rounded-xl px-4 py-3 min-h-[44px] items-center justify-center border ${
                        dosageUnit === u.value
                          ? "bg-primary border-primary"
                          : "bg-card-alt border-border"
                      }`}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          dosageUnit === u.value ? "text-white" : "text-text"
                        }`}
                      >
                        {getDosageLabel(u.value, t)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Category */}
            <View>
              <Text className="text-sm font-semibold text-text mb-2">{t('form.fieldCategory')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {(Object.entries(CATEGORY_CONFIG) as [MedicationCategory, typeof CATEGORY_CONFIG[MedicationCategory]][]).map(
                  ([key, cfg]) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setValue("category", key)}
                      className={`flex-row items-center gap-1.5 rounded-xl px-4 py-3 min-h-[44px] border ${
                        category === key
                          ? "border-primary bg-blue-50 dark:bg-blue-950/30"
                          : "border-border bg-card-alt"
                      }`}
                    >
                      <Ionicons
                        name={cfg.icon as any}
                        size={14}
                        color={category === key ? theme.primary : theme.muted}
                      />
                      <Text
                        className={`text-sm font-semibold ${
                          category === key ? "text-primary" : "text-text"
                        }`}
                      >
                        {getCategoryLabel(key, t)}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  function SlideAppearance() {
    return (
      <ScrollView style={{ width: screenWidth }} showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">{t('wizard.slideAppearanceTitle')}</Text>
          <Text className="text-sm text-muted mb-5">{t('wizard.slideAppearanceSubtitle')}</Text>

          {/* Color */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-sm font-semibold text-text mb-2">{t('form.fieldColor')}</Text>
            <ColorPicker value={color} onChange={(c) => setValue("color", c)} />
          </View>

          {/* Photo */}
          <View className="bg-card rounded-2xl border border-border p-4 items-center">
            <Text className="text-sm font-semibold text-text mb-3 self-start">{t('form.sectionPhoto')}</Text>
            {photoUri ? (
              <View className="items-center gap-3">
                <Image
                  source={{ uri: photoUri }}
                  className="w-24 h-24 rounded-2xl"
                  resizeMode="cover"
                />
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={pickPhoto}
                    className="flex-row items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2"
                  >
                    <Ionicons name="image-outline" size={14} color={theme.primary} />
                    <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold">{t('form.changePhoto')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setValue("photoUri", undefined)}
                    className="flex-row items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2"
                  >
                    <Ionicons name="trash-outline" size={14} color={theme.danger} />
                    <Text className="text-red-700 dark:text-red-400 text-xs font-semibold">{t('form.removePhoto')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickPhoto}
                className="flex-row items-center gap-2 bg-card-alt border border-dashed border-border rounded-2xl px-6 py-4"
              >
                <Ionicons name="camera-outline" size={20} color={theme.muted} />
                <Text className="text-muted font-semibold">{t('form.addPhoto')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  function SlideFrequency() {
    return (
      <ScrollView style={{ width: screenWidth }} showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">{t('wizard.slideFrequencyTitle')}</Text>
          <Text className="text-sm text-muted mb-5">{t('wizard.slideFrequencySubtitle')}</Text>

          <View className="flex-row gap-2 mb-4">
            {/* Once */}
            <TouchableOpacity
              onPress={() => setValue("repeatMode", "once")}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border ${
                repeatMode === "once"
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={repeatMode === "once" ? "#fff" : theme.muted}
              />
              <View>
                <Text
                  className={`text-sm font-bold ${
                    repeatMode === "once" ? "text-white" : "text-text"
                  }`}
                >
                  {t('form.modeOnce')}
                </Text>
                <Text
                  className={`text-xs ${
                    repeatMode === "once" ? "text-blue-100" : "text-muted"
                  }`}
                >
                  {t('form.modeOnceSub')}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Repeat */}
            <TouchableOpacity
              onPress={() => setValue("repeatMode", "repeat")}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border ${
                repeatMode === "repeat"
                  ? "bg-primary border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Ionicons
                name="repeat-outline"
                size={16}
                color={repeatMode === "repeat" ? "#fff" : theme.muted}
              />
              <View>
                <Text
                  className={`text-sm font-bold ${
                    repeatMode === "repeat" ? "text-white" : "text-text"
                  }`}
                >
                  {t('form.modeRepeat')}
                </Text>
                <Text
                  className={`text-xs ${
                    repeatMode === "repeat" ? "text-blue-100" : "text-muted"
                  }`}
                >
                  {t('form.modeRepeatSub')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* PRN row */}
          <TouchableOpacity
            onPress={() => setValue("repeatMode", "prn")}
            className={`flex-row items-center gap-2 rounded-2xl py-3 px-4 border mb-4 ${
              repeatMode === "prn"
                ? "bg-primary border-primary"
                : "bg-card border-border"
            }`}
          >
            <Ionicons
              name="hand-left-outline"
              size={16}
              color={repeatMode === "prn" ? "#fff" : theme.muted}
            />
            <View>
              <Text
                className={`text-sm font-bold ${
                  repeatMode === "prn" ? "text-white" : "text-text"
                }`}
              >
                {t('form.modePRN')}
              </Text>
              <Text
                className={`text-xs ${
                  repeatMode === "prn" ? "text-blue-100" : "text-muted"
                }`}
              >
                {t('form.modePRNSub')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Contextual tip */}
          {repeatMode === "repeat" && <TipBlock text={t('form.tipRepeatDates')} theme={theme} />}
          {repeatMode === "once" && <TipBlock text={t('form.tipOnceDateRequired')} theme={theme} />}
          {repeatMode === "prn" && <TipBlock text={t('form.tipPRN')} theme={theme} />}

          {/* Date pickers for once / repeat */}
          {repeatMode === "once" && (
            <View className="bg-card rounded-2xl border border-border px-4">
              <DateRow label={t('form.fieldDate')} value={onceDate} onChange={(v) => v && setValue("onceDate", v)} />
            </View>
          )}

          {repeatMode === "repeat" && (
            <View className="bg-card rounded-2xl border border-border px-4">
              <DateRow
                label={t('form.fieldStartDate')}
                value={startDate}
                onChange={(v) => {
                  setValue("startDate", v);
                  if (v && endDate && endDate < v) setValue("endDate", undefined);
                }}
                maximumDate={endDate ? new Date(endDate + "T12:00") : undefined}
              />
              <View className="border-b border-border" />
              <DateRow
                label={t('form.fieldEndDate')}
                value={endDate}
                onChange={(v) => setValue("endDate", v)}
                minimumDate={startDate ? new Date(startDate + "T12:00") : undefined}
              />
              <FieldError message={errors.endDate?.message ? t(errors.endDate.message as any) : undefined} />
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  function SlideAlarms() {
    return (
      <ScrollView style={{ width: screenWidth }} showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">{t('wizard.slideAlarmsTitle')}</Text>
          <Text className="text-sm text-muted mb-5">{t('wizard.slideAlarmsSubtitle')}</Text>

          {/* Contextual tip */}
          {repeatMode === "once"
            ? <TipBlock text={t('form.tipAlarmsOnce')} theme={theme} />
            : <TipBlock text={t('form.tipAlarmsDays')} theme={theme} />
          }

          {repeatMode === "once" ? (
            <>
              {scheduleFields.slice(0, 1).map((field, idx) => (
                <ScheduleRow
                  key={field.id}
                  schedule={watchedSchedules[idx] ?? field}
                  showDays={false}
                  onChange={(updated) => updateSchedule(idx, updated)}
                  onRemove={() => removeSchedule(idx)}
                />
              ))}
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs font-bold text-muted uppercase tracking-widest">
                  {t('form.sectionAlarms', { count: scheduleFields.length })}
                </Text>
                <TouchableOpacity
                  onPress={() => appendSchedule(newSchedule())}
                  className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5"
                >
                  <Ionicons name="add" size={14} color={theme.primary} />
                  <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold">{t('form.addAlarm')}</Text>
                </TouchableOpacity>
              </View>
              {scheduleFields.map((field, idx) => (
                <ScheduleRow
                  key={field.id}
                  schedule={watchedSchedules[idx] ?? field}
                  onChange={(updated) => updateSchedule(idx, updated)}
                  onRemove={() => removeSchedule(idx)}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  function SlideExtras() {
    return (
      <ScrollView style={{ width: screenWidth }} showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">{t('wizard.slideExtrasTitle')}</Text>
          <Text className="text-sm text-muted mb-5">{t('wizard.slideExtrasSubtitle')}</Text>

          {/* Notes */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-sm font-semibold text-text mb-1.5">
              {t('form.fieldNotes')}
            </Text>
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder={t('form.fieldNotesPlaceholder')}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
                  multiline
                  numberOfLines={3}
                />
              )}
            />
          </View>

          {/* Stock */}
          <View className="bg-card rounded-2xl border border-border p-4 gap-4">
            <Text className="text-xs font-bold text-muted uppercase tracking-widest">
              {t('form.sectionStock')}
            </Text>
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">{t('form.fieldStock')}</Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={stockQtyStr}
                  onChangeText={(v) => { setValue("stockQtyStr", v); if (!v.trim()) setValue("stockThreshStr", ""); }}
                  placeholder={t('form.fieldStockPlaceholder')}
                  placeholderTextColor={theme.muted}
                  keyboardType="number-pad"
                  className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                />
                <Text className="text-muted text-sm">{t('form.fieldStockUnit')}</Text>
              </View>
            </View>
            {!!stockQtyStr?.trim() && (
              <View>
                <Text className="text-sm font-semibold text-text mb-1.5">{t('form.fieldStockThreshold')}</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={stockThreshStr}
                    onChangeText={(v) => setValue("stockThreshStr", v)}
                    placeholder={t('form.fieldStockThresholdPlaceholder')}
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                  />
                  <Text className="text-muted text-sm">{t('form.fieldStockUnit')}</Text>
                </View>
              </View>
            )}
            {/* Prescription renewal (F1) */}
            <DateRow
              label={t('form.fieldRenewal')}
              value={watch("renewalDate")}
              onChange={(v) => setValue("renewalDate", v)}
              minimumDate={new Date()}
            />
            <Text className="text-xs text-muted -mt-2">{t('form.fieldRenewalHint')}</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ─── Build slides array ─────────────────────────────────────────────────

  // Cosmetic Appearance step trails the required identity/schedule steps and
  // the optional Extras step (audit UX I13). Keep this order in lockstep with
  // SLIDE_FIELDS, getLogicalSlide and canSkip above.
  const slides = isPRN
    ? [SlideIdentity, SlideFrequency, SlideExtras, SlideAppearance]
    : [SlideIdentity, SlideFrequency, SlideAlarms, SlideExtras, SlideAppearance];

  const renderSlide = useCallback(({ item: SlideComponent, index }: { item: () => React.JSX.Element; index: number }) => (
    <View style={{ width: screenWidth }}>
      <SlideComponent />
    </View>
  ), [screenWidth]);

  const keyExtractor = useCallback((_: any, index: number) => String(index), []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: screenWidth,
    offset: screenWidth * index,
    index,
  }), [screenWidth]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-background">
      {/* Progress indicator */}
      <StepIndicator current={currentSlide} total={totalSlides} />

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        renderItem={renderSlide}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
      />

      {/* Navigation footer */}
      <View className="px-5 pt-3 border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}>
        <View className="flex-row items-center gap-3">
          {/* Back button */}
          {currentSlide > 0 && (
            <TouchableOpacity
              onPress={goBack}
              className="rounded-2xl py-3.5 px-5 border border-border bg-card"
            >
              <Text className="text-text font-bold text-base">{t('wizard.back')}</Text>
            </TouchableOpacity>
          )}

          {/* Skip button for the optional slides (Extras, Appearance) */}
          {canSkip && !isLastSlide && (
            <TouchableOpacity
              onPress={handleSkip}
              className="py-3.5 px-4"
            >
              <Text className="text-muted font-semibold text-sm">{t('wizard.skip')}</Text>
            </TouchableOpacity>
          )}

          {/* Spacer */}
          <View className="flex-1" />

          {/* Skip and save (last slide only, when skippable) */}
          {isLastSlide && (
            <TouchableOpacity
              onPress={handleSkipAndSave}
              disabled={isSubmitting}
              className="py-3.5 px-4"
            >
              <Text className="text-muted font-semibold text-sm">{t('wizard.skipAndSave')}</Text>
            </TouchableOpacity>
          )}

          {/* Next / Submit button */}
          {isLastSlide ? (
            <TouchableOpacity
              onPress={handleSubmitPress}
              disabled={isSubmitting}
              className={`rounded-2xl py-3.5 px-6 ${isSubmitting ? "bg-slate-300" : "bg-primary"}`}
            >
              <Text className="text-white font-bold text-base">
                {isSubmitting ? t('common.saving') : submitLabel}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={goNext}
              className="rounded-2xl py-3.5 px-6 bg-primary"
            >
              <Text className="text-white font-bold text-base">{t('wizard.next')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
