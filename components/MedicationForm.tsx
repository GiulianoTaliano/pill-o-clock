import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Medication, DosageUnit, MedicationCategory } from "../src/types";
import { ColorPicker } from "./ColorPicker";
import { DayToggle } from "./DayToggle";
import { format } from "date-fns";
import { DOSAGE_UNITS, CATEGORY_CONFIG, getCategoryLabel, getDosageLabel } from "../src/utils";
import { useTranslation } from "../src/i18n";
import * as Haptics from "expo-haptics";
import { useToast } from "../src/context/ToastContext";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { medicationFormSchema, type MedicationFormData } from "../src/schemas/medication";
import { useAppTheme } from "../src/hooks/useAppTheme";

// ─── Inline error ──────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text className="text-danger text-xs mt-1">{message}</Text>;
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
    <View className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 mb-3 border border-slate-100 dark:border-slate-700">
      {/* Time */}
      <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-semibold text-text">{t('form.fieldTime')}</Text>
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          className="flex-row items-center gap-2 bg-card border dark:border-slate-600 rounded-xl px-4 py-2"
        >
          <Ionicons name="alarm-outline" size={16} color="#4f9cff" />
          <Text className="text-base font-bold text-primary">{schedule.time}</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={timeDate}
          mode="time"
          is24Hour
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
        onPress={onRemove}
        className="flex-row items-center gap-1 mt-3 self-end"
      >
        <Ionicons name="trash-outline" size={14} color="#ef4444" />
        <Text className="text-red-500 text-xs font-semibold">{t('form.removeAlarm')}</Text>
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
  const [show, setShow] = useState(false);

  const dateObj = value ? new Date(value + "T12:00") : (minimumDate ?? new Date());

  // Pre-fill on first open:
  // – use minimumDate if provided (e.g. end-date picker defaults to start date)
  // – otherwise use today
  // This fixes the iOS spinner not firing onChange when the initial value
  // already equals the picker's internal default.
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
    // Outer wrapper – DateTimePicker is a sibling of the label/button row
    // so it cannot overflow the row's flex layout (fixes iPhone overflow).
    <View className="py-2.5">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-text">{label}</Text>
        {value && (
          <TouchableOpacity onPress={() => { onChange(undefined); setShow(false); }} className="p-1">
            <Ionicons name="close-circle" size={16} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        onPress={handleOpen}
        className="flex-row items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5"
      >
        <Ionicons name="calendar-outline" size={14} color="#4f9cff" />
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

function newSchedule(): ScheduleInput {
  return {
    id: String(Date.now()),
    time: "08:00",
    days: [],
  };
}

export function MedicationForm({
  initialValues,
  existingNames = [],
  onSubmit,
  submitLabel,
  isSubmitting,
}: MedicationFormProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  // ─ Frecuencia ────────────────────────────────────────────────────────────
  const todayStr = format(new Date(), "yyyy-MM-dd");
  // Detect "once" mode from initial values (startDate === endDate, both set)
  const isInitiallyOnce = !!(
    initialValues?.startDate && initialValues.startDate === initialValues.endDate
  );

  const { control, handleSubmit: rhfHandleSubmit, watch, setValue, formState: { errors } } = useForm<MedicationFormData>({
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
      schedules: initialValues?.schedules?.length ? initialValues.schedules : [newSchedule()],
      stockQtyStr: initialValues?.stockQuantity != null ? String(initialValues.stockQuantity) : "",
      stockThreshStr: initialValues?.stockAlertThreshold != null ? String(initialValues.stockAlertThreshold) : "",
      photoUri: initialValues?.photoUri,
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
  const photoUri = watch("photoUri");
  const repeatMode = watch("repeatMode");
  const onceDate = watch("onceDate");

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
    // Duplicate-name check (case-insensitive)
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
      schedules: data.repeatMode === "prn" ? [] : data.schedules.map((s) =>
        data.repeatMode === "once" ? { ...s, days: [] } : s
      ),
      stockQuantity: data.stockQtyStr?.trim() ? Math.max(0, parseInt(data.stockQtyStr, 10)) : undefined,
      stockAlertThreshold: data.stockThreshStr?.trim() ? Math.max(0, parseInt(data.stockThreshStr, 10)) : undefined,
      isPRN: data.repeatMode === "prn",
      photoUri: data.photoUri,
    });
  };

  const handleValidationError = () => {
    // Show the first error as a toast for visibility
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

  return (
    <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
      <View className="px-5 pt-4 pb-8">

        {/* Section: Basic info */}
        <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
          {t('form.sectionInfo')}
        </Text>

        <View className="bg-card rounded-2xl border border-border p-4 mb-4 gap-4">
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
                  onChangeText={onChange}
                  placeholder={t('form.fieldNamePlaceholder')}
                  placeholderTextcolor={theme.muted}
                  className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800"
                  autoCapitalize="words"
                />
              )}
            />
            <FieldError message={errors.name?.message ? t(errors.name.message as any) : undefined} />
          </View>

          {/* Dosage */}
          <View>
            <Text className="text-sm font-semibold text-text mb-1.5">
              {t('form.fieldDose')} <Text className="text-danger">{t('common.required')}</Text>
            </Text>
            {/* Amount row */}
            <View className="flex-row items-center gap-2 mb-2">
              <Controller
                control={control}
                name="dosageAmount"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={t('form.fieldDoseAmountPlaceholder')}
                    placeholderTextcolor={theme.muted}
                    keyboardType="decimal-pad"
                    className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800 w-28"
                  />
                )}
              />
              <Text className="text-muted text-sm">{t('form.fieldDoseAmountLabel')}</Text>
            </View>
            <FieldError message={errors.dosageAmount?.message ? t(errors.dosageAmount.message as any) : undefined} />
            {/* Unit chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pb-1">
                {DOSAGE_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u.value}
                    onPress={() => setValue("dosageUnit", u.value)}
                    className={`rounded-xl px-4 py-2 border ${
                      dosageUnit === u.value
                        ? "bg-primary border-primary"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600"
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        dosageUnit === u.value ? "text-white" : "text-muted"
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
                    className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 border ${
                      category === key
                        ? "border-primary bg-blue-50 dark:bg-blue-950/30"
                        : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <Ionicons
                      name={cfg.icon as any}
                      size={14}
                      color={category === key ? "#4f9cff" : theme.muted}
                    />
                    <Text
                      className={`text-xs font-semibold ${
                        category === key ? "text-primary" : "text-muted"
                      }`}
                    >
                      {getCategoryLabel(key, t)}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>

          {/* Notes */}
          <View>
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
                  placeholderTextcolor={theme.muted}
                  className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800"
                  multiline
                  numberOfLines={2}
                />
              )}
            />
          </View>

          {/* Color */}
          <View>
            <Text className="text-sm font-semibold text-text mb-2">{t('form.fieldColor')}</Text>
            <ColorPicker value={color} onChange={(c) => setValue("color", c)} />
          </View>
        </View>

        {/* Section: Photo */}
        <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
          {t('form.sectionPhoto')}
        </Text>
        <View className="bg-card rounded-2xl border border-border p-4 mb-4 items-center">
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
                  <Ionicons name="image-outline" size={14} color="#3b82f6" />
                  <Text className="text-blue-500 text-xs font-semibold">{t('form.changePhoto')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setValue("photoUri", undefined)}
                  className="flex-row items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2"
                >
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  <Text className="text-red-500 text-xs font-semibold">{t('form.removePhoto')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickPhoto}
              className="flex-row items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl px-6 py-4"
            >
              <Ionicons name="camera-outline" size={20} color={theme.muted} />
              <Text className="text-muted font-semibold">{t('form.addPhoto')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Section: Frecuencia */}
        <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
          {t('form.sectionFrequency')}
        </Text>

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

        {repeatMode === "once" ? (
          /* ── Única vez ──────────────────────────────────────────── */
          <>
            <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
              {t('form.sectionWhen')}
            </Text>
            <View className="bg-card rounded-2xl border border-border px-4 mb-4">
              <DateRow label={t('form.fieldDate')} value={onceDate} onChange={(v) => v && setValue("onceDate", v)} />
            </View>

            <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
              {t('form.sectionAlarm')}
            </Text>
            {scheduleFields.slice(0, 1).map((field, idx) => (
              <ScheduleRow
                key={field.id}
                schedule={field}
                showDays={false}
                onChange={(updated) => updateSchedule(idx, updated)}
                onRemove={() => removeSchedule(idx)}
              />
            ))}
          </>
        ) : repeatMode === "prn" ? (
          /* ── A demanda (PRN) ────────────────────────────────────── */
          null
        ) : (
          /* ── Repetir ───────────────────────────────────────────── */
          <>
            <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
              {t('form.sectionPeriod')}
            </Text>
            <View className="bg-card rounded-2xl border border-border px-4 mb-4">
              <DateRow
                label={t('form.fieldStartDate')}
                value={startDate}
                onChange={(v) => {
                  setValue("startDate", v);
                  // If the current end date is now before the new start, clear it
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

            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-bold text-muted uppercase tracking-widest">
                {t('form.sectionAlarms', { count: scheduleFields.length })}
              </Text>
              <TouchableOpacity
                onPress={() => appendSchedule(newSchedule())}
                className="flex-row items-center gap-1 bg-blue-50 rounded-xl px-3 py-1.5"
              >
                <Ionicons name="add" size={14} color="#3b82f6" />
                <Text className="text-blue-500 text-xs font-bold">{t('form.addAlarm')}</Text>
              </TouchableOpacity>
            </View>
            {scheduleFields.map((field, idx) => (
              <ScheduleRow
                key={field.id}
                schedule={field}
                onChange={(updated) => updateSchedule(idx, updated)}
                onRemove={() => removeSchedule(idx)}
              />
            ))}
          </>
        )}

        {/* Section: Stock */}
        <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
          {t('form.sectionStock')}
        </Text>
        <View className="bg-card rounded-2xl border border-border p-4 mb-4 gap-4">
          <View>
            <Text className="text-sm font-semibold text-text mb-1.5">{t('form.fieldStock')}</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={stockQtyStr}
                onChangeText={(v) => { setValue("stockQtyStr", v); if (!v.trim()) setValue("stockThreshStr", ""); }}
                placeholder={t('form.fieldStockPlaceholder')}
                placeholderTextcolor={theme.muted}
                keyboardType="number-pad"
                className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800 w-28"
              />
              <Text className="text-muted text-sm">{t('form.fieldStockUnit')}</Text>
            </View>
          </View>
          {!!stockQtyStr.trim() && (
            <View>
              <Text className="text-sm font-semibold text-text mb-1.5">{t('form.fieldStockThreshold')}</Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={stockThreshStr}
                  onChangeText={(v) => setValue("stockThreshStr", v)}
                  placeholder={t('form.fieldStockThresholdPlaceholder')}
                  placeholderTextcolor={theme.muted}
                  keyboardType="number-pad"
                  className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800 w-28"
                />
                <Text className="text-muted text-sm">{t('form.fieldStockUnit')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); rhfHandleSubmit(handleFormSubmit, handleValidationError)(); }}
          disabled={isSubmitting}
          className={`rounded-2xl py-4 items-center mt-2 ${isSubmitting ? "bg-slate-300" : "bg-primary"}`}
        >
          <Text className="text-white font-bold text-base">
            {isSubmitting ? t('common.saving') : submitLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
