import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  Switch,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useState, useRef, useCallback, useMemo } from "react";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Medication, DosageUnit, MedicationCategory } from "../src/types";
import { ColorPicker } from "./ColorPicker";
import { DayToggle } from "./DayToggle";
import { addDays, format } from "date-fns";
import {
  DOSAGE_UNITS,
  CATEGORY_CONFIG,
  getCategoryLabel,
  getDosageLabel,
  formatTimeForDisplay,
  isScheduleActiveOnDate,
} from "../src/utils";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppStore } from "../src/store";
import * as Haptics from "expo-haptics";
import { useToast } from "../src/context/ToastContext";
import {
  useForm,
  Controller,
  useFieldArray,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  medicationFormSchema,
  type MedicationFormData,
  type MedicationFormInput,
} from "../src/schemas/medication";
import {
  searchDrugs,
  getActiveDrugCatalog,
  type DrugSuggestion,
} from "../src/services/drugDb";
import { isBarcodeScanSupported } from "../src/services/barcode";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import {
  parseRegimen,
  buildRegimenJson,
  withEffectiveDose,
  type Regimen,
} from "../src/services/regimen";
import { useAppTheme } from "../src/hooks/useAppTheme";

// ─── Inline error ──────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text className="text-danger text-xs mt-1">{message}</Text>;
}
// ─── Tip block ──────────────────────────────────────────────────────────────────────

function TipBlock({
  text,
  theme,
}: {
  text: string;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <View className="flex-row items-start gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5 mb-4">
      <Ionicons
        name="information-circle-outline"
        size={16}
        color={theme.primary}
        style={{ marginTop: 1 }}
      />
      <Text className="text-sm text-muted flex-1 leading-5">{text}</Text>
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

function ScheduleRow({
  schedule,
  onRemove,
  onChange,
  showDays = true,
}: ScheduleRowProps) {
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
        <Text className="text-sm font-semibold text-text">
          {t("form.fieldTime")}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${t("form.fieldTime")} ${formatTimeForDisplay(
            schedule.time
          )}`}
          onPress={() => setShowPicker(true)}
          className="flex-row items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 min-h-[44px]"
        >
          <Ionicons name="alarm-outline" size={16} color={theme.primary} />
          <Text className="text-base font-bold text-primary">
            {formatTimeForDisplay(schedule.time)}
          </Text>
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
          <Text className="text-sm font-semibold text-text mb-2">
            {t("form.fieldDays")}
          </Text>
          <DayToggle
            selectedDays={schedule.days}
            onChange={(days) => onChange({ ...schedule, days })}
          />
        </>
      )}

      {/* Remove */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("form.removeAlarm")}
        onPress={onRemove}
        className="flex-row items-center gap-1 mt-3 self-end min-h-[44px] px-2"
      >
        <Ionicons name="trash-outline" size={14} color={theme.danger} />
        <Text className="text-red-700 dark:text-red-400 text-xs font-semibold">
          {t("form.removeAlarm")}
        </Text>
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
  clearable?: boolean;
}

function DateRow({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  clearable = true,
}: DateRowProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [show, setShow] = useState(false);

  const dateObj = value
    ? new Date(value + "T12:00")
    : minimumDate ?? new Date();

  const handleOpen = () => {
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
        {value && clearable && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("form.clearDate")}
            onPress={() => {
              onChange(undefined);
              setShow(false);
            }}
            className="items-center justify-center"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Ionicons name="close-circle" size={16} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? t("form.selectDate")}`}
        onPress={handleOpen}
        className="flex-row items-center gap-2 bg-card-alt border border-border rounded-xl px-3 py-2.5"
      >
        <Ionicons name="calendar-outline" size={14} color={theme.primary} />
        <Text
          className={`text-sm font-semibold ${
            value ? "text-text" : "text-muted"
          }`}
        >
          {value
            ? format(new Date(value + "T12:00"), "dd/MM/yyyy")
            : t("form.selectDate")}
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
  /** PRN safety limits (F2). */
  prnMaxPerDay?: number;
  prnMinIntervalMinutes?: number;
  /** RxNorm SXDG id from the autocomplete pick (cleared on manual edits). */
  rxcui?: string;
  /** Complex regimen JSON (F3) — see services/regimen.ts. */
  regimen?: string;
  /** Injectable med (F3): site rotation + weekly countdown. */
  isInjectable?: boolean;
}

interface MedicationFormProps {
  initialValues?: MedicationFormValues;
  /** Names of existing medications for duplicate-name validation.
   *  When editing, exclude the current med's own name from this list. */
  existingNames?: string[];
  onSubmit: (values: MedicationFormValues) => Promise<boolean | void>;
  onSaved?: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function newSchedule(): ScheduleInput {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  1: [
    "repeatMode",
    "onceDate",
    "startDate",
    "endDate",
    "regimenNStr",
    "regimenOnStr",
    "regimenOffStr",
    "regimenMonthDayStr",
    "taperSteps",
    "prnMaxStr",
    "prnIntervalHoursStr",
    "schedules",
  ],
  2: [],
  3: [],
  4: [],
};

/** Maps the advanced-regimen form fields to the stored JSON (F3). */
function buildRegimenFromForm(data: MedicationFormData): string | undefined {
  if (data.repeatMode !== "repeat" || data.regimenType === "none")
    return undefined;
  const int = (v?: string) => parseInt((v ?? "").trim(), 10);
  let regimen: Regimen | null = null;
  if (data.regimenType === "everyN") {
    regimen = { type: "everyN", n: int(data.regimenNStr) };
  } else if (data.regimenType === "cycle") {
    regimen = {
      type: "cycle",
      on: int(data.regimenOnStr),
      off: int(data.regimenOffStr),
    };
  } else if (data.regimenType === "taper") {
    regimen = {
      type: "taper",
      steps: data.taperSteps.map((st) => ({
        days: int(st.daysStr),
        amount: parseFloat((st.amountStr ?? "").replace(",", ".")),
      })),
    };
  } else if (data.regimenType === "monthlyDay") {
    regimen = { type: "monthlyDay", day: int(data.regimenMonthDayStr) };
  }
  return buildRegimenJson(regimen);
}

export function MedicationForm({
  initialValues,
  onSubmit,
  onSaved,
  submitLabel,
  isSubmitting,
}: MedicationFormProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  const saved = useRef(false);
  const committing = useRef(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(!!initialValues?.regimen);
  const profiles = useAppStore((state) => state.profiles);
  const activeProfileId = useAppStore((state) => state.activeProfileId);
  const profileLabel =
    profiles.find((profile) => profile.id === activeProfileId)?.name ||
    t("profiles.me");
  const [currentSlide, setCurrentSlide] = useState(0);
  const sectionRefs = useRef<Record<string, View | null>>({});
  const isEditMode = !!initialValues;

  // ─ Frecuencia ────────────────────────────────────────────────────────────
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isInitiallyOnce = !!(
    initialValues?.startDate &&
    initialValues.startDate === initialValues.endDate
  );

  // Complex regimen defaults (F3) — decode the stored JSON for edit mode.
  const initialRegimen: Regimen | null = initialValues?.regimen
    ? parseRegimen({ regimen: initialValues.regimen })
    : null;

  const {
    control,
    handleSubmit: rhfHandleSubmit,
    watch,
    setValue: setFormValue,
    trigger,
    setFocus,
    getFieldState,
    formState: { errors, isDirty },
  } = useForm<MedicationFormInput, unknown, MedicationFormData>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      dosageAmount:
        initialValues?.dosageAmount != null
          ? String(initialValues.dosageAmount)
          : "",
      dosageUnit: initialValues?.dosageUnit ?? "comprimidos",
      category: initialValues?.category ?? "otro",
      notes: initialValues?.notes ?? "",
      color: initialValues?.color ?? "blue",
      repeatMode: initialValues?.isPRN
        ? "prn"
        : isInitiallyOnce
        ? "once"
        : "repeat",
      onceDate: isInitiallyOnce
        ? initialValues?.startDate ?? todayStr
        : todayStr,
      startDate: initialValues?.startDate,
      endDate: initialValues?.endDate,
      schedules: initialValues?.schedules?.length
        ? initialValues.schedules.map(normalizeScheduleDays)
        : [newSchedule()],
      stockQtyStr:
        initialValues?.stockQuantity != null
          ? String(initialValues.stockQuantity)
          : "",
      stockThreshStr:
        initialValues?.stockAlertThreshold != null
          ? String(initialValues.stockAlertThreshold)
          : "",
      photoUri: initialValues?.photoUri,
      renewalDate: initialValues?.renewalDate,
      prnMaxStr:
        initialValues?.prnMaxPerDay != null
          ? String(initialValues.prnMaxPerDay)
          : "",
      prnIntervalHoursStr:
        initialValues?.prnMinIntervalMinutes != null
          ? String(
              Math.round((initialValues.prnMinIntervalMinutes / 60) * 100) / 100
            )
          : "",
      rxcui: initialValues?.rxcui,
      isInjectable: initialValues?.isInjectable ?? false,
      regimenType: initialRegimen?.type ?? "none",
      regimenNStr:
        initialRegimen?.type === "everyN" ? String(initialRegimen.n) : "",
      regimenOnStr:
        initialRegimen?.type === "cycle" ? String(initialRegimen.on) : "",
      regimenOffStr:
        initialRegimen?.type === "cycle" ? String(initialRegimen.off) : "",
      regimenMonthDayStr:
        initialRegimen?.type === "monthlyDay" ? String(initialRegimen.day) : "",
      taperSteps:
        initialRegimen?.type === "taper"
          ? initialRegimen.steps.map((st) => ({
              daysStr: String(st.days),
              amountStr: String(st.amount),
            }))
          : [],
    },
  });

  const setValue: typeof setFormValue = (name, value, options) =>
    setFormValue(name, value, { shouldDirty: true, ...options });
  usePreventRemove(isDirty, ({ data }) => {
    if (saved.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (committing.current) return;
    Alert.alert(
      t("uxMedication.cancelChanges"),
      t("uxMedication.discardHint"),
      [
        { text: t("uxMedication.keepEditing"), style: "cancel" },
        {
          text: t("uxMedication.discard"),
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  const {
    fields: scheduleFields,
    append: appendSchedule,
    remove: removeScheduleAt,
  } = useFieldArray({
    control,
    name: "schedules",
  });

  const {
    fields: taperStepFields,
    append: appendTaperStep,
    remove: removeTaperStep,
  } = useFieldArray({
    control,
    name: "taperSteps",
  });
  const regimenType = watch("regimenType");

  const dosageUnit = watch("dosageUnit");
  const category = watch("category");
  const color = watch("color");
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const stockQtyStr = watch("stockQtyStr");
  const stockThreshStr = watch("stockThreshStr");

  // Offline drug-name autocomplete (F1). Cleared on pick or when too short.
  const [drugSuggestions, setDrugSuggestions] = useState<DrugSuggestion[]>([]);
  // Country-aware: which catalog's attribution to show, and whether the region
  // has a resolvable barcode mapping at all (hide the scanner otherwise).
  const drugAttributionKey = useMemo(
    () => getActiveDrugCatalog().attributionKey,
    []
  );
  const scanSupported = useMemo(() => isBarcodeScanSupported(), []);
  // Barcode scan accelerator (F2). Android-first; iOS works too via expo-camera.
  const [scannerOpen, setScannerOpen] = useState(false);
  const photoUri = watch("photoUri");
  const repeatMode = watch("repeatMode");
  const onceDate = watch("onceDate");
  const watchedSchedules = watch("schedules");

  const isPRN = repeatMode === "prn";
  const totalSlides = 3;

  // All frequencies use the same three creation steps.
  const getLogicalSlide = useCallback((visualIdx: number) => visualIdx, []);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast(t("form.errorPhotoPermission"), "error");
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
    if (committing.current) return;
    committing.current = true;
    try {
      const parsedAmount = parseFloat(data.dosageAmount.replace(",", "."));

      const didSave = await onSubmit({
        name: data.name.trim(),
        dosageAmount: parsedAmount,
        dosageUnit: data.dosageUnit,
        category: data.category,
        notes: (data.notes ?? "").trim(),
        color: data.color,
        startDate:
          data.repeatMode === "once"
            ? data.onceDate
            : data.repeatMode === "prn"
            ? undefined
            : data.startDate,
        endDate:
          data.repeatMode === "once"
            ? data.onceDate
            : data.repeatMode === "prn"
            ? undefined
            : data.endDate,
        schedules:
          data.repeatMode === "prn"
            ? []
            : (data.repeatMode === "once"
                ? data.schedules.slice(0, 1)
                : data.schedules
              ).map((s) => {
                // A frequency regimen owns the days, so the alarm is time-only and its
                // weekday filter is cleared (empty = every day, then gated by the
                // regimen). Same for "once" and for "all 7 days" (the daily convention).
                const days =
                  data.repeatMode === "once" ||
                  data.regimenType !== "none" ||
                  s.days.length === 7
                    ? []
                    : s.days;
                return { ...s, days };
              }),
        stockQuantity: data.stockQtyStr?.trim()
          ? Math.max(0, parseInt(data.stockQtyStr, 10))
          : undefined,
        stockAlertThreshold: data.stockThreshStr?.trim()
          ? Math.max(0, parseInt(data.stockThreshStr, 10))
          : undefined,
        isPRN: data.repeatMode === "prn",
        photoUri: data.photoUri,
        renewalDate: data.renewalDate,
        prnMaxPerDay:
          data.repeatMode === "prn" && data.prnMaxStr?.trim()
            ? Math.max(1, parseInt(data.prnMaxStr, 10))
            : undefined,
        prnMinIntervalMinutes:
          data.repeatMode === "prn" && data.prnIntervalHoursStr?.trim()
            ? Math.max(
                1,
                Math.round(
                  parseFloat(data.prnIntervalHoursStr.replace(",", ".")) * 60
                )
              )
            : undefined,
        rxcui: data.rxcui,
        regimen: buildRegimenFromForm(data),
        isInjectable: data.isInjectable,
      });
      if (didSave === true) {
        saved.current = true;
        onSaved?.();
      }
    } finally {
      committing.current = false;
    }
  };

  const handleValidationError = (
    validationErrors: FieldErrors<MedicationFormInput>
  ) => {
    const field = Object.keys(validationErrors)[0] as keyof MedicationFormData;
    if (!field) return;
    const firstError = validationErrors[field];
    if (
      ["stockQtyStr", "stockThreshStr", "notes", "renewalDate"].includes(field)
    )
      setExtrasOpen(true);
    if (field.startsWith("regimen") || field === "taperSteps")
      setAdvancedOpen(true);
    if (!isEditMode)
      setCurrentSlide(
        SLIDE_FIELDS[0].includes(field)
          ? 0
          : field.startsWith("stock") || field === "renewalDate"
          ? 2
          : 1
      );
    setTimeout(() => {
      const section = SLIDE_FIELDS[0].includes(field)
        ? "identity"
        : field.startsWith("stock") ||
          field === "renewalDate" ||
          field === "notes"
        ? "extras"
        : field === "schedules"
        ? "alarms"
        : "plan";
      const content = scrollRef.current?.getInnerViewNode();
      if (content && sectionRefs.current[section])
        sectionRefs.current[section]?.measureLayout(
          content,
          (_x, y) =>
            scrollRef.current?.scrollTo({
              y: Math.max(0, y - 16),
              animated: true,
            }),
          () => scrollRef.current?.scrollTo({ y: 0, animated: true })
        );
      setFocus(field as keyof MedicationFormInput);
    }, 150);
    if (firstError?.message) {
      showToast(t(firstError.message as any), "error");
    }
  };

  const updateSchedule = (idx: number, s: ScheduleInput) => {
    setValue(`schedules.${idx}`, s);
  };

  const removeSchedule = (idx: number) => {
    if (scheduleFields.length === 1) {
      showToast(t("form.errorNoAlarmsMsg"), "error");
      return;
    }
    removeScheduleAt(idx);
  };

  // ─── Wizard navigation ─────────────────────────────────────────────────

  const scrollToSlide = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const goNext = async () => {
    if (currentSlide >= totalSlides - 1) return;

    // In edit mode, skip validation when navigating forward
    if (!isEditMode) {
      const logicalSlide = getLogicalSlide(currentSlide);
      const fields = SLIDE_FIELDS[logicalSlide] ?? [];
      if (fields.length > 0) {
        const valid = await trigger(fields, { shouldFocus: true });
        if (!valid) {
          const validationErrors = Object.fromEntries(
            fields
              .filter((field) => getFieldState(field).error)
              .map((field) => [field, getFieldState(field).error])
          );
          handleValidationError(validationErrors);
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
    scrollToSlide();
  };

  const goBack = useCallback(() => {
    if (currentSlide <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prev = currentSlide - 1;
    setCurrentSlide(prev);
    scrollToSlide();
  }, [currentSlide, scrollToSlide]);

  const handleSubmitPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void rhfHandleSubmit(handleFormSubmit, handleValidationError)();
  };

  const isLastSlide = currentSlide === totalSlides - 1;

  // ─── Slide contents ─────────────────────────────────────────────────────

  function SlideIdentity() {
    return (
      <View>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">
            {t("wizard.slideIdentityTitle")}
          </Text>
          <Text className="text-sm text-muted mb-5">
            {t("wizard.slideIdentitySubtitle")}
          </Text>

          <View className="bg-card rounded-2xl border border-border p-4 gap-4">
            {/* Name */}
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">
                {t("form.fieldName")}{" "}
                <Text className="text-danger">{t("common.required")}</Text>
              </Text>
              <View className="flex-row items-center gap-2">
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, value, ref } }) => (
                    <TextInput
                      ref={ref}
                      value={value}
                      onChangeText={(v) => {
                        onChange(v);
                        // A manual edit invalidates the picked RxCUI identity.
                        setValue("rxcui", undefined);
                        setDrugSuggestions(searchDrugs(v));
                      }}
                      placeholder={t("form.fieldNamePlaceholder")}
                      placeholderTextColor={theme.muted}
                      className="flex-1 border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
                      autoCapitalize="words"
                    />
                  )}
                />
                {scanSupported && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("form.scanBarcode")}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setScannerOpen(true);
                    }}
                    className="border border-border rounded-xl px-3 py-2.5 bg-card-alt"
                  >
                    <Ionicons
                      name="barcode-outline"
                      size={22}
                      color={theme.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>
              {drugSuggestions.length > 0 && (
                <View className="mt-1 rounded-xl border border-border bg-card overflow-hidden">
                  {drugSuggestions.map((s) => (
                    <TouchableOpacity
                      key={s.name}
                      accessibilityRole="button"
                      accessibilityLabel={s.name}
                      onPress={() => {
                        setValue("name", s.name, { shouldValidate: true });
                        setValue("rxcui", s.rxcui || undefined);
                        setDrugSuggestions([]);
                      }}
                      className="px-3 py-2.5 border-b border-border"
                    >
                      <Text
                        className="text-sm font-medium text-text"
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      {s.strengths.length > 0 && (
                        <Text
                          className="text-[11px] text-muted mt-0.5"
                          numberOfLines={1}
                        >
                          {s.strengths.slice(0, 6).join(" · ")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                  <Text className="px-3 py-1.5 text-[10px] text-muted">
                    {t(drugAttributionKey as any)}
                  </Text>
                </View>
              )}
              <FieldError
                message={
                  errors.name?.message
                    ? t(errors.name.message as any)
                    : undefined
                }
              />
            </View>

            {/* Dosage */}
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">
                {t("form.fieldDose")}{" "}
                <Text className="text-danger">{t("common.required")}</Text>
              </Text>
              <View className="flex-row items-center gap-2 mb-2">
                <Controller
                  control={control}
                  name="dosageAmount"
                  render={({ field: { onChange, value, ref } }) => (
                    <TextInput
                      ref={ref}
                      value={value}
                      onChangeText={onChange}
                      placeholder={t("form.fieldDoseAmountPlaceholder")}
                      placeholderTextColor={theme.muted}
                      keyboardType="decimal-pad"
                      className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt flex-1 min-w-[120px]"
                    />
                  )}
                />
                <Text className="text-muted text-sm">
                  {t("form.fieldDoseAmountLabel")}
                </Text>
              </View>
              <FieldError
                message={
                  errors.dosageAmount?.message
                    ? t(errors.dosageAmount.message as any)
                    : undefined
                }
              />
              <Text className="text-xs text-muted mt-1 mb-1">
                {t("form.doseHint")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2 pb-1">
                  {DOSAGE_UNITS.map((u) => (
                    <TouchableOpacity
                      key={u.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: dosageUnit === u.value }}
                      onPress={() => setValue("dosageUnit", u.value)}
                      className={`rounded-xl px-4 py-3 min-h-[44px] items-center justify-center border ${
                        dosageUnit === u.value
                          ? "bg-action border-primary"
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
              <Text className="text-sm font-semibold text-text mb-2">
                {t("form.fieldCategory")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(
                  Object.entries(CATEGORY_CONFIG) as [
                    MedicationCategory,
                    (typeof CATEGORY_CONFIG)[MedicationCategory]
                  ][]
                ).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: category === key }}
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
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  function SlideAppearance() {
    return (
      <View>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">
            {t("wizard.slideAppearanceTitle")}
          </Text>
          <Text className="text-sm text-muted mb-5">
            {t("wizard.slideAppearanceSubtitle")}
          </Text>

          {/* Color */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-sm font-semibold text-text mb-2">
              {t("form.fieldColor")}
            </Text>
            <ColorPicker value={color} onChange={(c) => setValue("color", c)} />
          </View>

          {/* Photo */}
          <View className="bg-card rounded-2xl border border-border p-4 items-center">
            <Text className="text-sm font-semibold text-text mb-3 self-start">
              {t("form.sectionPhoto")}
            </Text>
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
                    <Ionicons
                      name="image-outline"
                      size={14}
                      color={theme.primary}
                    />
                    <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold">
                      {t("form.changePhoto")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setValue("photoUri", undefined)}
                    className="flex-row items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={14}
                      color={theme.danger}
                    />
                    <Text className="text-red-700 dark:text-red-400 text-xs font-semibold">
                      {t("form.removePhoto")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickPhoto}
                className="flex-row items-center gap-2 bg-card-alt border border-dashed border-border rounded-2xl px-6 py-4"
              >
                <Ionicons name="camera-outline" size={20} color={theme.muted} />
                <Text className="text-muted font-semibold">
                  {t("form.addPhoto")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  function SlideFrequency() {
    return (
      <View>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">
            {t("wizard.slideFrequencyTitle")}
          </Text>
          <Text className="text-sm text-muted mb-5">
            {t("wizard.slideFrequencySubtitle")}
          </Text>

          <View className="flex-row gap-2 mb-4">
            {/* Once */}
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ selected: repeatMode === "once" }}
              onPress={() => setValue("repeatMode", "once")}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border ${
                repeatMode === "once"
                  ? "bg-action border-primary"
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
                  {t("form.modeOnce")}
                </Text>
                <Text
                  className={`text-xs ${
                    repeatMode === "once" ? "text-blue-100" : "text-muted"
                  }`}
                >
                  {t("form.modeOnceSub")}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Repeat */}
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ selected: repeatMode === "repeat" }}
              onPress={() => setValue("repeatMode", "repeat")}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border ${
                repeatMode === "repeat"
                  ? "bg-action border-primary"
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
                  {t("form.modeRepeat")}
                </Text>
                <Text
                  className={`text-xs ${
                    repeatMode === "repeat" ? "text-blue-100" : "text-muted"
                  }`}
                >
                  {t("form.modeRepeatSub")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* PRN row */}
          <TouchableOpacity
            accessibilityRole="radio"
            accessibilityState={{ selected: repeatMode === "prn" }}
            onPress={() => setValue("repeatMode", "prn")}
            className={`flex-row items-center gap-2 rounded-2xl py-3 px-4 border mb-4 ${
              repeatMode === "prn"
                ? "bg-action border-primary"
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
                {t("form.modePRN")}
              </Text>
              <Text
                className={`text-xs ${
                  repeatMode === "prn" ? "text-blue-100" : "text-muted"
                }`}
              >
                {t("form.modePRNSub")}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Contextual tip */}
          {repeatMode === "repeat" && (
            <TipBlock text={t("form.tipRepeatDates")} theme={theme} />
          )}
          {repeatMode === "once" && (
            <TipBlock text={t("form.tipOnceDateRequired")} theme={theme} />
          )}
          {repeatMode === "prn" && (
            <TipBlock text={t("form.tipPRN")} theme={theme} />
          )}

          {/* PRN safety limits (F2) */}
          {repeatMode === "prn" && (
            <View className="bg-card rounded-2xl border border-border p-4 gap-3 mt-2">
              <Text className="text-xs font-bold text-muted uppercase tracking-widest">
                {t("form.prnLimitsSection")}
              </Text>
              <View>
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("form.prnMax")}
                </Text>
                <Controller
                  control={control}
                  name="prnMaxStr"
                  render={({ field: { onChange, value, ref } }) => (
                    <TextInput
                      ref={ref}
                      value={value}
                      onChangeText={onChange}
                      placeholder={t("form.prnMaxPlaceholder")}
                      placeholderTextColor={theme.muted}
                      keyboardType="number-pad"
                      className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                    />
                  )}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("form.prnInterval")}
                </Text>
                <Controller
                  control={control}
                  name="prnIntervalHoursStr"
                  render={({ field: { onChange, value, ref } }) => (
                    <TextInput
                      ref={ref}
                      value={value}
                      onChangeText={onChange}
                      placeholder={t("form.prnIntervalPlaceholder")}
                      placeholderTextColor={theme.muted}
                      keyboardType="decimal-pad"
                      className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                    />
                  )}
                />
              </View>
              <Text className="text-xs text-muted leading-4">
                {t("form.prnLimitsHint")}
              </Text>
            </View>
          )}

          {/* Date pickers for once / repeat */}
          {repeatMode === "once" && (
            <View className="bg-card rounded-2xl border border-border px-4">
              <DateRow
                clearable={false}
                label={t("form.fieldDate")}
                value={onceDate}
                onChange={(v) => v && setValue("onceDate", v)}
              />
            </View>
          )}

          {repeatMode === "repeat" && (
            <View className="bg-card rounded-2xl border border-border px-4">
              <DateRow
                label={t("form.fieldStartDate")}
                value={startDate}
                onChange={(v) => {
                  setValue("startDate", v);
                  if (v && endDate && endDate < v)
                    setValue("endDate", undefined);
                }}
                maximumDate={endDate ? new Date(endDate + "T12:00") : undefined}
              />
              <View className="border-b border-border" />
              <DateRow
                label={t("form.fieldEndDate")}
                value={endDate}
                onChange={(v) => setValue("endDate", v)}
                minimumDate={
                  startDate ? new Date(startDate + "T12:00") : undefined
                }
              />
              <FieldError
                message={
                  errors.endDate?.message
                    ? t(errors.endDate.message as any)
                    : undefined
                }
              />
            </View>
          )}

          {/* ── Advanced regimen (F3): everyN / cycle / taper ── */}
          {repeatMode === "repeat" && (
            <View className="mt-4">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded: advancedOpen }}
                onPress={() => setAdvancedOpen((value) => !value)}
                className="min-h-[48px] py-3 flex-row justify-between items-center"
              >
                <Text className="text-base font-semibold text-primary">
                  {t("uxMedication.advanced")}
                </Text>
                <Ionicons
                  name={advancedOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.primary}
                />
              </TouchableOpacity>
              {advancedOpen && (
                <View className="bg-card rounded-2xl border border-border p-4">
                  <View className="flex-row flex-wrap gap-2">
                    {(
                      [
                        "none",
                        "everyN",
                        "cycle",
                        "monthlyDay",
                        "taper",
                      ] as const
                    ).map((rt) => (
                      <TouchableOpacity
                        key={rt}
                        accessibilityRole="button"
                        accessibilityLabel={t(`form.regimen_${rt}`)}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setValue("regimenType", rt);
                          if (rt !== "none" && !startDate)
                            setValue("startDate", todayStr);
                          if (rt === "taper" && taperStepFields.length === 0) {
                            appendTaperStep({ daysStr: "", amountStr: "" });
                          }
                        }}
                        className={`rounded-xl px-3 py-2 border ${
                          regimenType === rt
                            ? "bg-action border-primary"
                            : "bg-card-alt border-border"
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            regimenType === rt ? "text-white" : "text-text"
                          }`}
                        >
                          {t(`form.regimen_${rt}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {regimenType === "everyN" && (
                    <>
                      <View className="flex-row items-center gap-2 mt-3">
                        <Text className="text-sm text-text">
                          {t("form.regimenEveryPrefix")}
                        </Text>
                        <Controller
                          control={control}
                          name="regimenNStr"
                          render={({ field: { onChange, value, ref } }) => (
                            <TextInput
                              ref={ref}
                              value={value}
                              onChangeText={onChange}
                              keyboardType="number-pad"
                              placeholder="2"
                              placeholderTextColor={theme.muted}
                              className="border border-border rounded-xl px-3 py-2 text-text text-base bg-card-alt w-16 text-center"
                            />
                          )}
                        />
                        <Text className="text-sm text-text">
                          {t("form.regimenEverySuffix")}
                        </Text>
                      </View>
                      <FieldError
                        message={
                          errors.regimenNStr?.message
                            ? t(errors.regimenNStr.message as any)
                            : undefined
                        }
                      />
                    </>
                  )}

                  {regimenType === "cycle" && (
                    <>
                      <View className="flex-row items-center gap-2 mt-3 flex-wrap">
                        <Controller
                          control={control}
                          name="regimenOnStr"
                          render={({ field: { onChange, value, ref } }) => (
                            <TextInput
                              ref={ref}
                              value={value}
                              onChangeText={onChange}
                              keyboardType="number-pad"
                              placeholder="21"
                              placeholderTextColor={theme.muted}
                              className="border border-border rounded-xl px-3 py-2 text-text text-base bg-card-alt w-16 text-center"
                            />
                          )}
                        />
                        <Text className="text-sm text-text">
                          {t("form.regimenCycleOn")}
                        </Text>
                        <Controller
                          control={control}
                          name="regimenOffStr"
                          render={({ field: { onChange, value, ref } }) => (
                            <TextInput
                              ref={ref}
                              value={value}
                              onChangeText={onChange}
                              keyboardType="number-pad"
                              placeholder="7"
                              placeholderTextColor={theme.muted}
                              className="border border-border rounded-xl px-3 py-2 text-text text-base bg-card-alt w-16 text-center"
                            />
                          )}
                        />
                        <Text className="text-sm text-text">
                          {t("form.regimenCycleOff")}
                        </Text>
                      </View>
                      <FieldError
                        message={
                          errors.regimenOnStr?.message
                            ? t(errors.regimenOnStr.message as any)
                            : undefined
                        }
                      />
                    </>
                  )}

                  {regimenType === "taper" && (
                    <View className="mt-3">
                      <Text className="text-xs text-muted mb-2">
                        {t("form.regimenTaperHint")}
                      </Text>
                      {taperStepFields.map((field, idx) => (
                        <View
                          key={field.id}
                          className="flex-row items-center gap-2 mb-2"
                        >
                          <Controller
                            control={control}
                            name={`taperSteps.${idx}.daysStr`}
                            render={({ field: { onChange, value, ref } }) => (
                              <TextInput
                                ref={ref}
                                value={value}
                                onChangeText={onChange}
                                keyboardType="number-pad"
                                placeholder="7"
                                placeholderTextColor={theme.muted}
                                className="border border-border rounded-xl px-3 py-2 text-text text-base bg-card-alt w-16 text-center"
                              />
                            )}
                          />
                          <Text className="text-sm text-text">
                            {t("form.regimenTaperDays")}
                          </Text>
                          <Controller
                            control={control}
                            name={`taperSteps.${idx}.amountStr`}
                            render={({ field: { onChange, value, ref } }) => (
                              <TextInput
                                ref={ref}
                                value={value}
                                onChangeText={onChange}
                                keyboardType="decimal-pad"
                                placeholder="40"
                                placeholderTextColor={theme.muted}
                                className="border border-border rounded-xl px-3 py-2 text-text text-base bg-card-alt w-20 text-center"
                              />
                            )}
                          />
                          <Text
                            className="text-sm text-text flex-1"
                            numberOfLines={1}
                          >
                            {getDosageLabel(dosageUnit, t)}
                          </Text>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={t("form.regimenTaperRemove")}
                            onPress={() => removeTaperStep(idx)}
                            className="p-1.5"
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={20}
                              color={theme.muted}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        onPress={() =>
                          appendTaperStep({ daysStr: "", amountStr: "" })
                        }
                        className="flex-row items-center gap-1 self-start bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2"
                      >
                        <Ionicons name="add" size={14} color={theme.primary} />
                        <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold">
                          {t("form.regimenTaperAdd")}
                        </Text>
                      </TouchableOpacity>
                      <FieldError
                        message={
                          errors.taperSteps?.message
                            ? t(errors.taperSteps.message as any)
                            : undefined
                        }
                      />
                    </View>
                  )}

                  {regimenType === "monthlyDay" && (
                    <>
                      <View className="flex-row items-center gap-2 mt-3">
                        <Text className="text-sm text-text">
                          {t("form.regimenMonthDayPrefix")}
                        </Text>
                        <Controller
                          control={control}
                          name="regimenMonthDayStr"
                          render={({ field: { onChange, value, ref } }) => (
                            <TextInput
                              ref={ref}
                              value={value}
                              onChangeText={onChange}
                              keyboardType="number-pad"
                              placeholder="20"
                              placeholderTextColor={theme.muted}
                              className="border border-border rounded-xl px-3 py-2 text-text text-base bg-card-alt w-16 text-center"
                            />
                          )}
                        />
                        <Text className="text-sm text-text">
                          {t("form.regimenMonthDaySuffix")}
                        </Text>
                      </View>
                      <FieldError
                        message={
                          errors.regimenMonthDayStr?.message
                            ? t(errors.regimenMonthDayStr.message as any)
                            : undefined
                        }
                      />
                    </>
                  )}

                  {regimenType !== "none" && (
                    <Text className="text-sm text-muted mt-3 leading-5">
                      {t("uxMedication.regimenAnchor", {
                        date: startDate ?? todayStr,
                      })}
                      {regimenType === "monthlyDay"
                        ? ` ${t("uxMedication.monthShort")}`
                        : ""}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  function SlideAlarms() {
    return (
      <View>
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">
            {t("wizard.slideAlarmsTitle")}
          </Text>
          <Text className="text-sm text-muted mb-5">
            {t("wizard.slideAlarmsSubtitle")}
          </Text>

          {/* Contextual tip */}
          {repeatMode === "once" ? (
            <TipBlock text={t("uxMedication.onceHint")} theme={theme} />
          ) : regimenType !== "none" ? (
            <TipBlock text={t("form.tipAlarmsRegimen")} theme={theme} />
          ) : (
            <TipBlock text={t("form.tipAlarmsDays")} theme={theme} />
          )}

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
                  {t("form.sectionAlarms", { count: scheduleFields.length })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const schedule = newSchedule();
                    const last =
                      watchedSchedules[watchedSchedules.length - 1]?.time ??
                      "07:00";
                    const [hour, minute] = last.split(":").map(Number);
                    schedule.time = `${String((hour + 1) % 24).padStart(
                      2,
                      "0"
                    )}:${String(minute).padStart(2, "0")}`;
                    appendSchedule(schedule);
                  }}
                  className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5"
                >
                  <Ionicons name="add" size={14} color={theme.primary} />
                  <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold">
                    {t("form.addAlarm")}
                  </Text>
                </TouchableOpacity>
              </View>
              {scheduleFields.map((field, idx) => (
                <ScheduleRow
                  key={field.id}
                  schedule={watchedSchedules[idx] ?? field}
                  // With a frequency regimen (everyN / cycle / taper / monthly)
                  // the days are already determined by the regimen — the alarm
                  // only needs the time. The weekday picker shows only for a
                  // plain daily/recurring schedule (regimenType "none").
                  showDays={regimenType === "none"}
                  onChange={(updated) => updateSchedule(idx, updated)}
                  onRemove={() => removeSchedule(idx)}
                />
              ))}
            </>
          )}
        </View>
      </View>
    );
  }

  function SlideExtras() {
    return (
      <View
        collapsable={false}
        ref={(node) => {
          sectionRefs.current.extras = node;
        }}
      >
        <View className="px-5 pt-2 pb-8">
          <Text className="text-xl font-bold text-text mb-1">
            {t("wizard.slideExtrasTitle")}
          </Text>
          <Text className="text-sm text-muted mb-5">
            {t("wizard.slideExtrasSubtitle")}
          </Text>

          {/* Notes */}
          <View className="bg-card rounded-2xl border border-border p-4 mb-4">
            <Text className="text-sm font-semibold text-text mb-1.5">
              {t("form.fieldNotes")}
            </Text>
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value, ref } }) => (
                <TextInput
                  ref={ref}
                  value={value}
                  onChangeText={onChange}
                  placeholder={t("form.fieldNotesPlaceholder")}
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
              {t("form.sectionStock")}
            </Text>
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">
                {t("uxMedication.stockLabel")}
              </Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={stockQtyStr}
                  onChangeText={(v) => {
                    setValue("stockQtyStr", v);
                    if (!v.trim()) setValue("stockThreshStr", "");
                  }}
                  placeholder={t("form.fieldStockPlaceholder")}
                  placeholderTextColor={theme.muted}
                  keyboardType="number-pad"
                  className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                />
                <Text className="text-muted text-sm">
                  {t("uxMedication.stockUnit")}
                </Text>
              </View>
              <Text className="text-sm text-muted mt-2">
                {t("uxMedication.stockHint")}
              </Text>
              <FieldError
                message={
                  errors.stockQtyStr?.message
                    ? t(errors.stockQtyStr.message)
                    : undefined
                }
              />
            </View>
            {!!stockQtyStr?.trim() && (
              <View>
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("form.fieldStockThreshold")}
                </Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={stockThreshStr}
                    onChangeText={(v) => setValue("stockThreshStr", v)}
                    placeholder={t("form.fieldStockThresholdPlaceholder")}
                    placeholderTextColor={theme.muted}
                    keyboardType="number-pad"
                    className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt w-28"
                  />
                  <Text className="text-muted text-sm">
                    {t("uxMedication.stockUnit")}
                  </Text>
                </View>
                <FieldError
                  message={
                    errors.stockThreshStr?.message
                      ? t(errors.stockThreshStr.message)
                      : undefined
                  }
                />
              </View>
            )}
            {/* Injectable (F3): site rotation + weekly countdown, opt-in */}
            <View className="flex-row items-center gap-3 py-1">
              <Ionicons
                name="fitness-outline"
                size={18}
                color={theme.primary}
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text">
                  {t("form.fieldInjectable")}
                </Text>
                <Text className="text-xs text-muted mt-0.5">
                  {t("form.fieldInjectableHint")}
                </Text>
              </View>
              <Controller
                control={control}
                name="isInjectable"
                render={({ field: { onChange, value } }) => (
                  <Switch
                    value={value}
                    onValueChange={(v) => {
                      Haptics.selectionAsync();
                      onChange(v);
                    }}
                    trackColor={{ false: undefined, true: theme.primary }}
                    accessibilityLabel={t("form.fieldInjectable")}
                  />
                )}
              />
            </View>

            {/* Prescription renewal (F1) */}
            <DateRow
              label={t("form.fieldRenewal")}
              value={watch("renewalDate")}
              onChange={(v) => setValue("renewalDate", v)}
              minimumDate={new Date()}
            />
            <Text className="text-xs text-muted -mt-2">
              {t("form.fieldRenewalHint")}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const values = watch();
  const previewMedication = {
    id: "preview",
    name: values.name,
    dosage: "",
    dosageAmount: Number(values.dosageAmount.replace(",", ".")),
    dosageUnit: values.dosageUnit,
    category: values.category,
    color: values.color,
    isActive: true,
    createdAt: `${todayStr}T12:00:00`,
    startDate:
      values.repeatMode === "once" ? values.onceDate : values.startDate,
    endDate: values.repeatMode === "once" ? values.onceDate : values.endDate,
    regimen: buildRegimenFromForm(values as MedicationFormData),
  } as Medication;
  const preview: { date: string; time: string; amount: number }[] = [];
  if (!isPRN) {
    for (let day = 0; day < 62 && preview.length < 5; day++) {
      const date = addDays(new Date(), day);
      const dateStr = format(date, "yyyy-MM-dd");
      const inputs =
        repeatMode === "once" ? watchedSchedules.slice(0, 1) : watchedSchedules;
      for (const input of [...inputs].sort((a, b) =>
        a.time.localeCompare(b.time)
      )) {
        const schedule = {
          ...input,
          medicationId: "preview",
          isActive: true,
          days:
            repeatMode === "once" ||
            regimenType !== "none" ||
            input.days.length === 7
              ? []
              : input.days,
        };
        if (day === 0 && input.time <= format(new Date(), "HH:mm")) continue;
        if (isScheduleActiveOnDate(schedule, date, previewMedication)) {
          preview.push({
            date: dateStr,
            time: input.time,
            amount: withEffectiveDose(previewMedication, dateStr).dosageAmount,
          });
        }
        if (preview.length === 5) break;
      }
    }
  }

  function Review() {
    return (
      <View className="px-5 py-3">
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold text-text"
        >
          {t("uxMedication.review")}
        </Text>
        <Text className="text-base text-muted mt-2 mb-5">
          {t("uxMedication.reviewHint")}
        </Text>
        <View className="bg-card border border-border rounded-2xl p-5">
          <Text className="text-base text-muted mb-3">{profileLabel}</Text>
          <Text className="text-xl font-bold text-text">{values.name}</Text>
          <Text className="text-lg text-text mt-2">
            {values.dosageAmount} {getDosageLabel(values.dosageUnit, t)}
          </Text>
          <Text className="text-base text-muted mt-2">
            {t(
              `uxMedication.${
                repeatMode === "repeat"
                  ? "repeat"
                  : repeatMode === "once"
                  ? "once"
                  : "prn"
              }`
            )}
          </Text>
          {previewMedication.startDate && (
            <Text className="text-base text-muted mt-1">
              {t("uxMedication.starts", { date: previewMedication.startDate })}
            </Text>
          )}
          {previewMedication.endDate && (
            <Text className="text-base text-muted mt-1">
              {t("uxMedication.ends", { date: previewMedication.endDate })}
            </Text>
          )}
          {!isPRN && (
            <>
              <Text className="text-base font-bold text-text mt-5 mb-2">
                {t("uxMedication.nextDates")}
              </Text>
              {preview.length === 0 && (
                <Text className="text-base text-muted">
                  {t("uxMedication.noUpcoming")}
                </Text>
              )}
              {preview.map((item) => (
                <Text
                  key={`${item.date}-${item.time}`}
                  className="text-base text-text py-1"
                >
                  {format(new Date(`${item.date}T12:00`), "PP", {
                    locale: getDateLocale(),
                  })}{" "}
                  · {formatTimeForDisplay(item.time)} · {item.amount}{" "}
                  {getDosageLabel(values.dosageUnit, t)}
                </Text>
              ))}
            </>
          )}
          {isPRN && (
            <Text className="text-base text-muted mt-3">
              {t("form.tipPRN")}
            </Text>
          )}
        </View>
      </View>
    );
  }

  function OptionalSections() {
    return (
      <View className="pb-5">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: extrasOpen }}
          onPress={() => setExtrasOpen((open) => !open)}
          className="mx-5 border-t border-border py-4 flex-row items-center justify-between"
        >
          <Text className="text-base font-semibold text-text">
            {t("uxMedication.optional")}
          </Text>
          <Ionicons
            name={extrasOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.primary}
          />
        </TouchableOpacity>
        {extrasOpen && SlideExtras()}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: appearanceOpen }}
          onPress={() => setAppearanceOpen((open) => !open)}
          className="mx-5 border-t border-border py-4 flex-row items-center justify-between"
        >
          <Text className="text-base font-semibold text-text">
            {t("uxMedication.appearance")}
          </Text>
          <Ionicons
            name={appearanceOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={theme.primary}
          />
        </TouchableOpacity>
        {appearanceOpen && SlideAppearance()}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      {!isEditMode && (
        <View className="px-5 pt-3 pb-4">
          <Text accessibilityRole="header" className="text-sm text-muted">
            {t("uxMedication.step", {
              current: currentSlide + 1,
              total: totalSlides,
            })}
          </Text>
          <View className="flex-row gap-2 mt-2">
            {["identity", "plan", "review"].map((key, index) => (
              <TouchableOpacity
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: index === currentSlide }}
                disabled={index > currentSlide}
                onPress={() => {
                  setCurrentSlide(index);
                  scrollRef.current?.scrollTo({ y: 0 });
                }}
                className={`flex-1 border-b-2 py-2 ${
                  index === currentSlide ? "border-primary" : "border-border"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    index === currentSlide ? "text-primary" : "text-muted"
                  }`}
                >
                  {t(`uxMedication.${key}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {(isEditMode || currentSlide === 0) && (
          <View
            collapsable={false}
            ref={(node) => {
              sectionRefs.current.identity = node;
            }}
          >
            {SlideIdentity()}
          </View>
        )}
        {(isEditMode || currentSlide === 1) && (
          <>
            <View
              collapsable={false}
              ref={(node) => {
                sectionRefs.current.plan = node;
              }}
            >
              {SlideFrequency()}
            </View>
            {!isPRN && (
              <View
                collapsable={false}
                ref={(node) => {
                  sectionRefs.current.alarms = node;
                }}
              >
                {SlideAlarms()}
              </View>
            )}
          </>
        )}
        {(isEditMode || currentSlide === 2) && (
          <>
            {Review()}
            {OptionalSections()}
          </>
        )}
        {Object.entries(errors).length > 0 && (
          <View
            accessibilityRole="alert"
            className="mx-5 rounded-xl bg-card border border-danger p-4"
          >
            {Object.entries(errors).map(([key, error]) => (
              <Text key={key} className="text-danger text-base mb-1">
                {error?.message
                  ? t(error.message as string)
                  : t("form.errorGeneric")}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
      <View
        className="px-5 pt-3 border-t border-border bg-background"
        style={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}
      >
        <View className="flex-row gap-3">
          {!isEditMode && currentSlide > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={goBack}
              className="py-4 px-5 rounded-xl border border-border"
            >
              <Text className="text-text font-semibold text-base">
                {t("wizard.back")}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            disabled={isSubmitting}
            onPress={isEditMode || isLastSlide ? handleSubmitPress : goNext}
            className="flex-1 rounded-xl py-4 px-3 items-center bg-action"
          >
            <Text className="text-white font-bold text-base">
              {isSubmitting
                ? t("common.saving")
                : isEditMode || isLastSlide
                ? submitLabel
                : t("wizard.next")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barcode scan → prefill name + RxCUI; graceful fallback to typing. */}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(match) => {
          setScannerOpen(false);
          if (match) {
            setValue("name", match.suggestion.name, { shouldValidate: true });
            setValue("rxcui", match.suggestion.rxcui || undefined);
            setDrugSuggestions([]);
            showToast(t("uxMedication.scanReview"), "info");
          } else {
            showToast(t("form.scanNoMatch"), "error");
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}
