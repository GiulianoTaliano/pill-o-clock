import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, Platform, KeyboardAvoidingView, useWindowDimensions, PanResponder, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useCallback, useRef, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAppStore } from "../../src/store";
import { HealthMeasurement, MeasurementType, DailyCheckin } from "../../src/types";
import { useTranslation, getDateLocale } from "../../src/i18n";
import i18n from "../../src/i18n";
import { SimpleLineChart } from "../../components/SimpleLineChart";
import { CheckinModal } from "../../components/CheckinModal";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../src/context/ToastContext";
import { today } from "../../src/utils";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import {
  scheduleHealthReminder,
  cancelHealthReminder,
  getHealthReminderTime,
} from "../../src/services/notifications";
import { FlashList } from "@shopify/flash-list";

// ─── Metric config ─────────────────────────────────────────────────────────

type MetricMeta = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  bg: string;
  dual: boolean; // blood pressure has two fields
};

const METRIC_META: Record<MeasurementType, MetricMeta> = {
  blood_pressure: { icon: "heart",         color: "#ef4444", bg: "#fee2e2", dual: true  },
  glucose:        { icon: "water-outline", color: "#3b82f6", bg: "#dbeafe", dual: false },
  weight:         { icon: "barbell-outline",color:"#8b5cf6", bg: "#ede9fe", dual: false },
  spo2:           { icon: "pulse-outline", color: "#06b6d4", bg: "#cffafe", dual: false },
  heart_rate:     { icon: "pulse",         color: "#f97316", bg: "#ffedd5", dual: false },
};

const METRIC_TYPES: MeasurementType[] = [
  "blood_pressure", "glucose", "weight", "spo2", "heart_rate",
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function tDyn(key: string, opts?: object): string {
  return (i18n.t as (k: string, o?: object) => string)(key, opts);
}

function typeName(type: MeasurementType): string {
  return tDyn(`health.${type}_name`);
}

function typeUnit(type: MeasurementType): string {
  return tDyn(`health.${type}_unit`);
}

function formatValue(m: HealthMeasurement): string {
  if (m.type === "blood_pressure" && m.value2 != null) {
    return `${m.value1}/${m.value2}`;
  }
  return `${m.value1}`;
}

function formatMeasuredAt(iso: string): string {
  try {
    return format(new Date(iso), "Pp", { locale: getDateLocale() });
  } catch {
    return iso;
  }
}

const MOOD_EMOJIS: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

// ─── Add measurement form state ────────────────────────────────────────────

interface AddForm {
  value1Str: string;
  value2Str: string; // only for blood_pressure
  measuredAt: Date;
  notes: string;
  showDatePicker: boolean;
  showTimePicker: boolean;
}

function defaultAddForm(): AddForm {
  return {
    value1Str: "",
    value2Str: "",
    measuredAt: new Date(),
    notes: "",
    showDatePicker: false,
    showTimePicker: false,
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────────────

// Isolating list items in their own components prevents react-native-css-interop's
// upgrade-warning serializer from crawling through the parent closure and
// accidentally triggering React Navigation's context getter (which throws when
// accessed outside its own NavigationContainer scope).

function MeasurementListItem({
  m,
  meta,
  onDelete,
}: {
  m: HealthMeasurement;
  meta: MetricMeta;
  onDelete: () => void;
}) {
  return (
    <View className="bg-card rounded-2xl border border-border p-4 mb-3 flex-row items-center gap-3">
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: meta.bg }}
      >
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View className="flex-1">
        <Text className="text-lg font-black text-text">
          {formatValue(m)}
          <Text className="text-sm font-normal text-muted"> {typeUnit(m.type)}</Text>
        </Text>
        <Text className="text-xs text-muted mt-0.5">{formatMeasuredAt(m.measuredAt)}</Text>
        {m.notes ? (
          <Text className="text-xs text-muted italic mt-1">{m.notes}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${tDyn('common.delete')} ${formatValue(m)} ${typeUnit(m.type)}`}
        onPress={onDelete}
        className="p-2"
      >
        <Ionicons name="trash-outline" size={16} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );
}

function CheckinListItem({
  checkin,
  onPress,
}: {
  checkin: DailyCheckin;
  onPress: () => void;
}) {
  const dateFmt = format(new Date(checkin.date + "T12:00"), "PPP", { locale: getDateLocale() });
  const dateCap = dateFmt.charAt(0).toUpperCase() + dateFmt.slice(1);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-card rounded-2xl border border-border p-4 mb-3 flex-row items-center gap-3"
    >
      <Text className="text-2xl">{MOOD_EMOJIS[checkin.mood]}</Text>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text">{dateCap}</Text>
        <Text className="text-xs text-muted mt-0.5">
          {tDyn(`checkin.mood_${checkin.mood}`)}
          {checkin.symptoms.length > 0
            ? ` · ${checkin.symptoms.map((s) => tDyn(`checkin.symptom_${s}`)).join(", ")}`
            : ""}
        </Text>
        {checkin.notes ? (
          <Text className="text-xs text-muted italic mt-1" numberOfLines={1}>{checkin.notes}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

function SubTabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  // Use style instead of className for all conditional appearance so
  // react-native-css-interop never sees a new CSS feature after initial
  // render (avoids printUpgradeWarning → navigation-context crash).
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 py-2 rounded-xl items-center"
      style={
        active
          ? {
              backgroundColor: theme.card,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
              elevation: 1,
            }
          : undefined
      }
    >
      <Text
        className="text-sm font-bold"
        style={{ color: active ? (theme.isDark ? "#f8fafc" : "#1e293b") : theme.muted }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MetricOverviewCard({
  type,
  latest,
  miniData,
  onPress,
}: {
  type: MeasurementType;
  latest: HealthMeasurement | undefined;
  miniData: number[];
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const meta = METRIC_META[type];
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-card rounded-2xl border border-border p-4 mb-3 flex-row items-center gap-3"
    >
      <View
        className="w-12 h-12 rounded-2xl items-center justify-center"
        style={{ backgroundColor: meta.bg }}
      >
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text">{typeName(type)}</Text>
        {latest ? (
          <Text className="text-lg font-black mt-0.5" style={{ color: meta.color }}>
            {formatValue(latest)}
            <Text className="text-xs font-normal text-muted"> {typeUnit(type)}</Text>
          </Text>
        ) : (
          <Text className="text-xs text-muted mt-1 italic">{t("health.noMeasurements")}</Text>
        )}
      </View>
      {miniData.length > 1 && (
        <SimpleLineChart
          data={miniData}
          color={meta.color}
          width={64}
          height={36}
          mini
        />
      )}
      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

function TodayCheckinCard({
  checkin,
  onPress,
}: {
  checkin: DailyCheckin | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="bg-card rounded-2xl border border-border p-4 mb-4">
      <View className="flex-row items-center gap-3">
        <Text className="text-3xl">{checkin ? MOOD_EMOJIS[checkin.mood] : "🌡"}</Text>
        <View className="flex-1">
          <Text className="text-sm font-bold text-text">
            {checkin ? t("checkin.alreadyDone") : t("checkin.homePromptTitle")}
          </Text>
          <Text className="text-xs text-muted">
            {checkin
              ? checkin.symptoms.map((s) => tDyn(`checkin.symptom_${s}`)).join(", ") ||
                checkin.notes ||
                tDyn(`checkin.mood_${checkin.mood}`)
              : t("checkin.homePromptSubtitle")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onPress}
          className="bg-primary/10 border border-primary/30 rounded-xl px-3 py-2"
        >
          <Text className="text-primary text-xs font-bold">
            {checkin ? t("checkin.editToday") : t("checkin.saveButton")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReminderActiveRow({
  reminderTime,
  onCancel,
}: {
  reminderTime: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
        <Text className="text-sm font-bold text-green-700 dark:text-green-400">
          {t("health.reminderActive", { time: reminderTime })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onCancel}
        className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl"
      >
        <Ionicons name="close" size={16} color="#64748b" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function HealthScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const theme = useAppTheme();

  const healthMeasurements = useAppStore((s) => s.healthMeasurements);
  const loadHealthMeasurements = useAppStore((s) => s.loadHealthMeasurements);
  const addHealthMeasurement = useAppStore((s) => s.addHealthMeasurement);
  const deleteHealthMeasurement = useAppStore((s) => s.deleteHealthMeasurement);
  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const loadDailyCheckins = useAppStore((s) => s.loadDailyCheckins);

  const [tab, setTab] = useState<"measurements" | "diary">("measurements");
  const [selectedType, setSelectedType] = useState<MeasurementType | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(defaultAddForm());
  const [checkinVisible, setCheckinVisible] = useState(false);
  const [editCheckin, setEditCheckin] = useState<DailyCheckin | undefined>(undefined);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [showReminderPicker, setShowReminderPicker] = useState(false);

  // Load data on focus; close reminder picker when leaving the screen
  useFocusEffect(
    useCallback(() => {
      loadHealthMeasurements();
      loadDailyCheckins();
      getHealthReminderTime().then(setReminderTime);
      return () => {
        setShowReminderPicker(false);
      };
    }, [loadHealthMeasurements, loadDailyCheckins])
  );

  // ── Filtered measurements for selected type ──────────────────────────────

  const typeItems = selectedType
    ? healthMeasurements.filter((m) => m.type === selectedType)
    : [];

  const chartData1 = [...typeItems].reverse().map((m) => m.value1);
  const chartData2 =
    selectedType === "blood_pressure"
      ? [...typeItems].reverse().map((m) => m.value2 ?? 0)
      : undefined;

  // ── Measurements helper ───────────────────────────────────────────────────

  function getLatest(type: MeasurementType): HealthMeasurement | undefined {
    return healthMeasurements.find((m) => m.type === type);
  }

  function getMiniData(type: MeasurementType): number[] {
    return healthMeasurements
      .filter((m) => m.type === type)
      .slice(0, 10)
      .reverse()
      .map((m) => m.value1);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDeleteMeasurement = (m: HealthMeasurement) => {
    Alert.alert(
      t("health.deleteTitle"),
      t("health.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteHealthMeasurement(m.id),
        },
      ]
    );
  };

  const openAddModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddForm(defaultAddForm());
    setAddModalVisible(true);
  };

  const handleSaveMeasurement = async () => {
    const v1 = parseFloat(addForm.value1Str);
    if (isNaN(v1)) {
      Alert.alert(t("common.error"), t("health.errorRequired"));
      return;
    }
    if (selectedType === "blood_pressure") {
      const v2 = parseFloat(addForm.value2Str);
      if (isNaN(v2)) {
        Alert.alert(t("common.error"), t("health.errorInvalid"));
        return;
      }
      await addHealthMeasurement({
        type: selectedType,
        value1: v1,
        value2: v2,
        measuredAt: addForm.measuredAt.toISOString(),
        notes: addForm.notes.trim() || undefined,
      });
    } else {
      await addHealthMeasurement({
        type: selectedType!,
        value1: v1,
        measuredAt: addForm.measuredAt.toISOString(),
        notes: addForm.notes.trim() || undefined,
      });
    }
    setAddModalVisible(false);
    showToast(t("health.saveButton"), "success");
  };

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setAddForm((f) => ({
      ...f,
      measuredAt: date ?? f.measuredAt,
      showDatePicker: Platform.OS === "ios",
    }));
  };

  const handleTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setAddForm((f) => ({
      ...f,
      measuredAt: date ?? f.measuredAt,
      showTimePicker: Platform.OS === "ios",
    }));
  };

  const measurementPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) setAddModalVisible(false); },
    })
  ).current;

  const handleReminderChange = async (_: DateTimePickerEvent, date?: Date) => {
    setShowReminderPicker(Platform.OS === "ios");
    if (!date) return;
    const time = format(date, "HH:mm");
    await scheduleHealthReminder(time);
    setReminderTime(time);
    showToast(t("health.reminderSaved"), "success");
  };

  const handleCancelReminder = async () => {
    await cancelHealthReminder();
    setReminderTime(null);
    showToast(t("health.reminderCancelled"), "info");
  };

  // ── Today's check-in ──────────────────────────────────────────────────────

  const todayStr = today();
  const todayCheckin = dailyCheckins.find((c) => c.date === todayStr);
  const recentCheckins = dailyCheckins.slice(0, 10);

  // ── Render ────────────────────────────────────────────────────────────────

  const meta = selectedType ? METRIC_META[selectedType] : null;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {selectedType && tab === "measurements" ? (
            <TouchableOpacity onPress={() => setSelectedType(null)} className="mr-1">
              <Ionicons name="arrow-back" size={22} color="#4f9cff" />
            </TouchableOpacity>
          ) : null}
          <Text className="text-2xl font-black text-text">
            {selectedType && tab === "measurements" ? typeName(selectedType) : t("health.title")}
          </Text>
        </View>

        {/* Reminder bell / Add button */}
        {tab === "measurements" && selectedType && (
          <TouchableOpacity
            onPress={openAddModal}
            className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        {tab === "diary" && (
          <TouchableOpacity
            onPress={() => { setEditCheckin(undefined); setCheckinVisible(true); }}
            className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Sub-tabs */}
      {!selectedType && (
        <View className="flex-row mx-5 mb-3 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
          {([
            { key: "measurements" as const, label: t("health.tabMeasurements") },
            { key: "diary" as const,        label: t("health.tabDiary") },
          ]).map(({ key, label }) => (
            <SubTabButton
              key={key}
              active={tab === key}
              label={label}
              onPress={() => setTab(key)}
            />
          ))}
        </View>
      )}

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>

        {/* ── MEASUREMENTS TAB ──────────────────────────────────────────── */}
        {tab === "measurements" && (
          <>
            {selectedType ? (
              /* ── DETAIL VIEW ── */
              <>
                {/* Chart card */}
                {typeItems.length > 1 && (
                  <View className="rounded-2xl border border-border p-4 mb-4" style={{ backgroundColor: theme.card }}>
                    <Text className="text-xs font-semibold text-muted mb-3 uppercase tracking-wide">
                      {t("health.chart")}
                    </Text>
                    <SimpleLineChart
                      data={chartData1}
                      data2={chartData2}
                      color={meta!.color}
                      color2={theme.muted}
                      width={width - 72}
                      height={120}
                    />
                    {selectedType === "blood_pressure" && (
                      <View className="flex-row gap-4 mt-2">
                        <View className="flex-row items-center gap-1.5">
                          <View className="w-3 h-0.5 rounded" style={{ backgroundColor: meta!.color }} />
                          <Text className="text-xs text-muted">{tDyn("health.blood_pressure_field1")}</Text>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <View className="w-3 h-0.5 rounded border border-dashed border-slate-400" />
                          <Text className="text-xs text-muted">{tDyn("health.blood_pressure_field2")}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Measurements list */}
                {typeItems.length === 0 ? (
                  <EmptyState
                    icon={meta!.icon}
                    title={t("health.noMeasurements")}
                    subtitle={t("health.noMeasurementsSubtitle")}
                  />
                ) : (
                  <FlashList
                    data={typeItems}
                    renderItem={({ item: m }) => (
                      <MeasurementListItem
                        key={m.id}
                        m={m}
                        meta={meta!}
                        onDelete={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          handleDeleteMeasurement(m);
                        }}
                      />
                    )}
                    keyExtractor={(item) => item.id}
                  />
                )}
              </>
            ) : (
              /* ── OVERVIEW CARDS ── */
              <>
                {METRIC_TYPES.map((type) => (
                  <MetricOverviewCard
                    key={type}
                    type={type}
                    latest={getLatest(type)}
                    miniData={getMiniData(type)}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedType(type);
                    }}
                  />
                ))}

                {/* Daily reminder section */}
                <View className="bg-card rounded-2xl border border-border p-4 mt-2 mb-4">
                  <View className="flex-row items-center gap-3 mb-3">
                    <View className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 items-center justify-center">
                      <Ionicons name="notifications-outline" size={18} color="#22c55e" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-text">{t("health.reminderSection")}</Text>
                      <Text className="text-xs text-muted">{t("health.reminderSubtitle")}</Text>
                    </View>
                  </View>

                  {reminderTime ? (
                    <ReminderActiveRow
                      reminderTime={reminderTime}
                      onCancel={handleCancelReminder}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowReminderPicker(true)}
                      className="flex-row items-center gap-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3"
                    >
                      <Ionicons name="time-outline" size={16} color={theme.muted} />
                      <Text className="text-sm text-muted">{t("health.reminderNone")} · {t("health.reminderTapToConfigure")}</Text>
                    </TouchableOpacity>
                  )}

                  {showReminderPicker && (
                    <DateTimePicker
                      value={(() => {
                        if (reminderTime) {
                          const [h, m] = reminderTime.split(":").map(Number);
                          const d = new Date();
                          d.setHours(h, m, 0, 0);
                          return d;
                        }
                        return new Date();
                      })()}
                      mode="time"
                      is24Hour
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={handleReminderChange}
                    />
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* ── DIARY TAB ─────────────────────────────────────────────────── */}
        {tab === "diary" && (
          <>
            {/* Today's check-in card */}
            <TodayCheckinCard
              checkin={todayCheckin}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEditCheckin(todayCheckin);
                setCheckinVisible(true);
              }}
            />

            {/* Past check-ins */}
            {recentCheckins.length === 0 ? (
              <EmptyState
                icon="happy-outline"
                title={t("checkin.noCheckins")}
                subtitle={t("checkin.noCheckinsSubtitle")}
              />
            ) : (
              <FlashList
                data={recentCheckins.filter((c) => c.date !== todayStr)}
                renderItem={({ item: checkin }) => (
                  <CheckinListItem
                    key={checkin.id}
                    checkin={checkin}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setEditCheckin(checkin);
                      setCheckinVisible(true);
                    }}
                  />
                )}
                keyExtractor={(item) => item.id}
              />
            )}
          </>
        )}

        <View className="h-6" />
      </ScrollView>

      {/* ── ADD MEASUREMENT MODAL ──────────────────────────────────────── */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setAddModalVisible(false)}>
          <Pressable onPress={() => {}} className="bg-background rounded-t-3xl">
              <View className="items-center pt-3 pb-1" {...measurementPan.panHandlers}>
                <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
              </View>
              <ScrollView
                className="px-5"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text className="text-lg font-black text-text mt-3 mb-4">
                  {selectedType ? typeName(selectedType) : t("health.addButton")}
                </Text>

                {/* Value field(s) */}
                {selectedType === "blood_pressure" ? (
                  <View className="flex-row gap-3 mb-4">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-text mb-1.5">{tDyn("health.blood_pressure_field1")}</Text>
                      <TextInput
                        value={addForm.value1Str}
                        onChangeText={(v) => setAddForm((f) => ({ ...f, value1Str: v }))}
                        placeholder="120"
                        placeholderTextColor={theme.muted}
                        keyboardType="numeric"
                        className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-text mb-1.5">{tDyn("health.blood_pressure_field2")}</Text>
                      <TextInput
                        value={addForm.value2Str}
                        onChangeText={(v) => setAddForm((f) => ({ ...f, value2Str: v }))}
                        placeholder="80"
                        placeholderTextColor={theme.muted}
                        keyboardType="numeric"
                        className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card"
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text className="text-sm font-semibold text-text mb-1.5">
                      {selectedType ? tDyn(`health.${selectedType}_field1`) : t("health.fieldNotes")}
                      {selectedType ? ` (${typeUnit(selectedType!)})` : ""}
                    </Text>
                    <TextInput
                      value={addForm.value1Str}
                      onChangeText={(v) => setAddForm((f) => ({ ...f, value1Str: v }))}
                      placeholder={selectedType === "weight" ? "70.5" : selectedType === "spo2" ? "98" : "100"}
                      placeholderTextColor={theme.muted}
                      keyboardType="numeric"
                      className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-4"
                    />
                  </>
                )}

                {/* Date */}
                <Text className="text-sm font-semibold text-text mb-1.5">{t("health.fieldDate")}</Text>
                <TouchableOpacity
                  onPress={() => setAddForm((f) => ({ ...f, showDatePicker: true }))}
                  className="flex-row items-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-1"
                >
                  <Ionicons name="calendar-outline" size={16} color="#4f9cff" />
                  <Text className="text-text font-semibold">
                    {format(addForm.measuredAt, "PPP", { locale: getDateLocale() })}
                  </Text>
                </TouchableOpacity>
                {addForm.showDatePicker && (
                  <DateTimePicker
                    value={addForm.measuredAt}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleDateChange}
                  />
                )}

                {/* Time */}
                <Text className="text-sm font-semibold text-text mb-1.5 mt-3">{t("health.fieldTime")}</Text>
                <TouchableOpacity
                  onPress={() => setAddForm((f) => ({ ...f, showTimePicker: true }))}
                  className="flex-row items-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-1"
                >
                  <Ionicons name="time-outline" size={16} color="#4f9cff" />
                  <Text className="text-text font-semibold">
                    {format(addForm.measuredAt, "HH:mm")}
                  </Text>
                </TouchableOpacity>
                {addForm.showTimePicker && (
                  <DateTimePicker
                    value={addForm.measuredAt}
                    mode="time"
                    is24Hour
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleTimeChange}
                  />
                )}

                {/* Notes */}
                <Text className="text-sm font-semibold text-text mb-1.5 mt-3">{t("health.fieldNotes")}</Text>
                <TextInput
                  value={addForm.notes}
                  onChangeText={(v) => setAddForm((f) => ({ ...f, notes: v }))}
                  placeholder={t("health.fieldNotesPlaceholder")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-sm bg-card mb-4"
                  multiline
                  numberOfLines={2}
                />

                {/* Actions */}
                <View className="flex-row gap-3 mb-8">
                  <TouchableOpacity
                    onPress={() => setAddModalVisible(false)}
                    className="flex-1 py-3.5 border border-border rounded-2xl items-center"
                  >
                    <Text className="font-semibold text-muted">{t("common.cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSaveMeasurement(); }}
                    className="flex-1 flex-2 py-3.5 rounded-2xl items-center bg-primary"
                  >
                    <Text className="font-bold text-white">{t("health.saveButton")}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── CHECK-IN MODAL ───────────────────────────────────────────────── */}
      <CheckinModal
        visible={checkinVisible}
        onClose={() => setCheckinVisible(false)}
        existing={editCheckin}
      />
    </SafeAreaView>
  );
}
