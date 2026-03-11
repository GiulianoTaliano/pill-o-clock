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
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
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
  const [name, setName] = useState(initialValues?.name ?? "");
  const [dosageAmountStr, setDosageAmountStr] = useState(
    initialValues?.dosageAmount != null ? String(initialValues.dosageAmount) : ""
  );
  const [dosageUnit, setDosageUnit] = useState<DosageUnit>(
    initialValues?.dosageUnit ?? "comprimidos"
  );
  const [category, setCategory] = useState<MedicationCategory>(
    initialValues?.category ?? "otro"
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [color, setColor] = useState<Medication["color"]>(
    initialValues?.color ?? "blue"
  );
  const [startDate, setStartDate] = useState(initialValues?.startDate);
  const [endDate, setEndDate] = useState(initialValues?.endDate);
  const [schedules, setSchedules] = useState<ScheduleInput[]>(
    initialValues?.schedules?.length ? initialValues.schedules : [newSchedule()]
  );
  const [stockQtyStr, setStockQtyStr] = useState(
    initialValues?.stockQuantity != null ? String(initialValues.stockQuantity) : ""
  );
  const [stockThreshStr, setStockThreshStr] = useState(
    initialValues?.stockAlertThreshold != null ? String(initialValues.stockAlertThreshold) : ""
  );
  const [photoUri, setPhotoUri] = useState<string | undefined>(initialValues?.photoUri);

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
      setPhotoUri(result.assets[0].uri);
    }
  };

  // ─ Frecuencia ────────────────────────────────────────────────────────────
  const todayStr = format(new Date(), "yyyy-MM-dd");
  // Detect "once" mode from initial values (startDate === endDate, both set)
  const isInitiallyOnce = !!(
    initialValues?.startDate && initialValues.startDate === initialValues.endDate
  );
  const [repeatMode, setRepeatMode] = useState<"once" | "repeat" | "prn">(
    initialValues?.isPRN ? "prn" : isInitiallyOnce ? "once" : "repeat"
  );
  const [onceDate, setOnceDate] = useState<string>(
    isInitiallyOnce ? (initialValues?.startDate ?? todayStr) : todayStr
  );

  const { showToast } = useToast();

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast(t('form.errorNameRequiredMsg'), "error");
      return;
    }
    // Duplicate-name check (case-insensitive)
    const trimmedName = name.trim().toLowerCase();
    if (existingNames.some((n) => n.toLowerCase() === trimmedName)) {
      showToast(t('form.errorDuplicateMsg', { name: name.trim() }), "error");
      return;
    }
    const parsedAmount = parseFloat(dosageAmountStr.replace(",", "."));
    if (!dosageAmountStr.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast(t('form.errorDoseRequiredMsg'), "error");
      return;
    }
    if (repeatMode !== "prn" && schedules.length === 0) {
      showToast(t('form.errorNoAlarmsMsg'), "error");
      return;
    }
    // Date-range check (repeat mode only)
    if (repeatMode === "repeat" && startDate && endDate && endDate < startDate) {
      showToast(t('form.errorInvalidPeriodMsg'), "error");
      return;
    }

    await onSubmit({
      name: name.trim(),
      dosageAmount: parsedAmount,
      dosageUnit,
      category,
      notes: notes.trim(),
      color,
      startDate: repeatMode === "once" ? onceDate : repeatMode === "prn" ? undefined : startDate,
      endDate:   repeatMode === "once" ? onceDate : repeatMode === "prn" ? undefined : endDate,
      schedules: repeatMode === "prn" ? [] : schedules.map((s) =>
        repeatMode === "once" ? { ...s, days: [] } : s
      ),
      stockQuantity: stockQtyStr.trim() ? Math.max(0, parseInt(stockQtyStr, 10)) : undefined,
      stockAlertThreshold: stockThreshStr.trim() ? Math.max(0, parseInt(stockThreshStr, 10)) : undefined,
      isPRN: repeatMode === "prn",
      photoUri,
    });
  };

  const updateSchedule = (idx: number, s: ScheduleInput) => {
    setSchedules((prev) => prev.map((p, i) => (i === idx ? s : p)));
  };

  const removeSchedule = (idx: number) => {
    if (schedules.length === 1) {
      showToast(t('form.errorNoAlarmsMsg'), "error");
      return;
    }
    setSchedules((prev) => prev.filter((_, i) => i !== idx));
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
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('form.fieldNamePlaceholder')}
              placeholderTextColor="#94a3b8"
              className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800"
              autoCapitalize="words"
            />
          </View>

          {/* Dosage */}
          <View>
            <Text className="text-sm font-semibold text-text mb-1.5">
              {t('form.fieldDose')} <Text className="text-danger">{t('common.required')}</Text>
            </Text>
            {/* Amount row */}
            <View className="flex-row items-center gap-2 mb-2">
              <TextInput
                value={dosageAmountStr}
                onChangeText={setDosageAmountStr}
                placeholder={t('form.fieldDoseAmountPlaceholder')}
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800 w-28"
              />
              <Text className="text-muted text-sm">{t('form.fieldDoseAmountLabel')}</Text>
            </View>
            {/* Unit chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2 pb-1">
                {DOSAGE_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u.value}
                    onPress={() => setDosageUnit(u.value)}
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
                    onPress={() => setCategory(key)}
                    className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 border ${
                      category === key
                        ? "border-primary bg-blue-50 dark:bg-blue-950/30"
                        : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <Ionicons
                      name={cfg.icon as any}
                      size={14}
                      color={category === key ? "#4f9cff" : "#94a3b8"}
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
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('form.fieldNotesPlaceholder')}
              placeholderTextColor="#94a3b8"
              className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-text text-base bg-slate-50 dark:bg-slate-800"
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Color */}
          <View>
            <Text className="text-sm font-semibold text-text mb-2">{t('form.fieldColor')}</Text>
            <ColorPicker value={color} onChange={setColor} />
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
                  onPress={() => setPhotoUri(undefined)}
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
              <Ionicons name="camera-outline" size={20} color="#94a3b8" />
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
            onPress={() => setRepeatMode("once")}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border ${
              repeatMode === "once"
                ? "bg-primary border-primary"
                : "bg-card border-border"
            }`}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={repeatMode === "once" ? "#fff" : "#94a3b8"}
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
            onPress={() => setRepeatMode("repeat")}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border ${
              repeatMode === "repeat"
                ? "bg-primary border-primary"
                : "bg-card border-border"
            }`}
          >
            <Ionicons
              name="repeat-outline"
              size={16}
              color={repeatMode === "repeat" ? "#fff" : "#94a3b8"}
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
          onPress={() => setRepeatMode("prn")}
          className={`flex-row items-center gap-2 rounded-2xl py-3 px-4 border mb-4 ${
            repeatMode === "prn"
              ? "bg-primary border-primary"
              : "bg-card border-border"
          }`}
        >
          <Ionicons
            name="hand-left-outline"
            size={16}
            color={repeatMode === "prn" ? "#fff" : "#94a3b8"}
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
              <DateRow label={t('form.fieldDate')} value={onceDate} onChange={(v) => v && setOnceDate(v)} />
            </View>

            <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
              {t('form.sectionAlarm')}
            </Text>
            {schedules.slice(0, 1).map((s, idx) => (
              <ScheduleRow
                key={s.id}
                schedule={s}
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
                  setStartDate(v);
                  // If the current end date is now before the new start, clear it
                  if (v && endDate && endDate < v) setEndDate(undefined);
                }}
                maximumDate={endDate ? new Date(endDate + "T12:00") : undefined}
              />
              <View className="border-b border-border" />
              <DateRow
                label={t('form.fieldEndDate')}
                value={endDate}
                onChange={setEndDate}
                minimumDate={startDate ? new Date(startDate + "T12:00") : undefined}
              />
            </View>

            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-bold text-muted uppercase tracking-widest">
                {t('form.sectionAlarms', { count: schedules.length })}
              </Text>
              <TouchableOpacity
                onPress={() => setSchedules((prev) => [...prev, newSchedule()])}
                className="flex-row items-center gap-1 bg-blue-50 rounded-xl px-3 py-1.5"
              >
                <Ionicons name="add" size={14} color="#3b82f6" />
                <Text className="text-blue-500 text-xs font-bold">{t('form.addAlarm')}</Text>
              </TouchableOpacity>
            </View>
            {schedules.map((s, idx) => (
              <ScheduleRow
                key={s.id}
                schedule={s}
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
                onChangeText={(v) => { setStockQtyStr(v); if (!v.trim()) setStockThreshStr(""); }}
                placeholder={t('form.fieldStockPlaceholder')}
                placeholderTextColor="#94a3b8"
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
                  onChangeText={setStockThreshStr}
                  placeholder={t('form.fieldStockThresholdPlaceholder')}
                  placeholderTextColor="#94a3b8"
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
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSubmit(); }}
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
