import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState, useCallback, useRef, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { format, subDays } from "date-fns";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";
import { useAppStore } from "../../src/store";
import type {
  HealthMeasurement,
  MeasurementType,
  DailyCheckin,
} from "../../src/types";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { SimpleLineChart } from "../../components/SimpleLineChart";
import { CheckinModal } from "../../components/CheckinModal";
import { AdBanner } from "../../components/AdBanner";
import { EmptyState } from "../../components/EmptyState";
import { ProfileChip } from "../../components/ProfileChip";
import { useToast } from "../../src/context/ToastContext";
import { today, formatTimeForDisplay } from "../../src/utils";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { parseMeasurementInput } from "../../src/services/carePlan";
import { updateHealthMeasurement } from "../../src/db/database";
import { getActiveProfileId } from "../../src/services/profileStore";
import {
  scheduleHealthReminder,
  cancelHealthReminder,
  getHealthReminderTime,
} from "../../src/services/notifications";

const TYPES: MeasurementType[] = [
  "blood_pressure",
  "glucose",
  "weight",
  "spo2",
  "heart_rate",
];
const ICONS: Record<
  MeasurementType,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  blood_pressure: "heart-outline",
  glucose: "water-outline",
  weight: "barbell-outline",
  spo2: "pulse-outline",
  heart_rate: "pulse",
};
const MOODS = ["", "😞", "😕", "😐", "🙂", "😄"];
const newForm = () => ({
  value1: "",
  value2: "",
  measuredAt: new Date(),
  notes: "",
});

export default function HealthScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const measurements = useAppStore((s) => s.healthMeasurements);
  const loadMeasurements = useAppStore((s) => s.loadHealthMeasurements);
  const addMeasurement = useAppStore((s) => s.addHealthMeasurement);
  const deleteMeasurement = useAppStore((s) => s.deleteHealthMeasurement);
  const checkins = useAppStore((s) => s.dailyCheckins);
  const loadCheckins = useAppStore((s) => s.loadDailyCheckins);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const [tab, setTab] = useState<"measurements" | "diary">("measurements");
  const [type, setType] = useState<MeasurementType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<HealthMeasurement | null>(null);
  const [form, setForm] = useState(newForm);
  const baseline = useRef("");
  const saveGuard = useRef(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState<"date" | "time" | null>(null);
  const [checkinVisible, setCheckinVisible] = useState(false);
  const [editCheckin, setEditCheckin] = useState<DailyCheckin | undefined>();
  const [limit, setLimit] = useState(20);
  const [range, setRange] = useState<7 | 30 | 90 | null>(30);
  const [reminder, setReminder] = useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderPicker, setReminderPicker] = useState(false);
  const [reminderDraft, setReminderDraft] = useState(new Date());
  const [reminderBusy, setReminderBusy] = useState(false);
  const load = useCallback(async () => {
    if (getActiveProfileId() !== activeProfileId) return;
    setLoading(true);
    setLoadError(false);
    try {
      await Promise.all([
        loadMeasurements(),
        loadCheckins(),
        getHealthReminderTime().then(setReminder),
      ]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loadMeasurements, loadCheckins, activeProfileId]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        setReminderOpen(false);
        setReminderPicker(false);
      };
    }, [load])
  );
  const sorted = useMemo(
    () =>
      [...measurements].sort((a, b) =>
        b.measuredAt.localeCompare(a.measuredAt)
      ),
    [measurements]
  );
  const cutoff = range == null ? null : subDays(new Date(), range).getTime();
  const items = type
    ? sorted.filter(
        (m) =>
          m.type === type &&
          (cutoff == null || new Date(m.measuredAt).getTime() >= cutoff)
      )
    : [];
  const chronological = [...items].reverse();
  const todayCheckin = checkins.find((c) => c.date === today());
  const pastCheckins = checkins.filter((c) => c.date !== today());
  const stamp = (iso: string) =>
    format(new Date(iso), "Pp", { locale: getDateLocale() });
  const value = (m: HealthMeasurement) =>
    `${m.value1}${m.value2 != null ? `/${m.value2}` : ""} ${t(
      `health.${m.type}_unit`
    )}`;
  const open = (m?: HealthMeasurement) => {
    const next = m
      ? {
          value1: String(m.value1),
          value2: m.value2 == null ? "" : String(m.value2),
          measuredAt: new Date(m.measuredAt),
          notes: m.notes ?? "",
        }
      : newForm();
    setForm(next);
    baseline.current = JSON.stringify(next);
    setEditing(m ?? null);
    setFieldError(null);
    setModal(true);
  };
  const dismiss = () => {
    if (saving) return;
    const close = () => {
      setModal(false);
      setDatePicker(null);
    };
    if (JSON.stringify(form) !== baseline.current)
      Alert.alert(t("uxHealth.discardTitle"), t("uxHealth.discardBody"), [
        { text: t("uxHealth.keepEditing"), style: "cancel" },
        { text: t("uxHealth.discard"), style: "destructive", onPress: close },
      ]);
    else close();
  };
  const save = async () => {
    if (!type || saveGuard.current) return;
    const v1 = parseMeasurementInput(form.value1, type);
    const v2 =
      type === "blood_pressure"
        ? parseMeasurementInput(form.value2, type)
        : undefined;
    if (v1 == null || v2 === null) {
      setFieldError(
        t(type === "spo2" ? "uxHealth.invalidSpo2" : "uxHealth.invalidValue")
      );
      return;
    }
    if (form.measuredAt.getTime() > Date.now() + 60_000) {
      setFieldError(t("uxHealth.measurementFuture"));
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    setFieldError(null);
    try {
      const data = {
        type,
        value1: v1,
        value2: v2,
        measuredAt: form.measuredAt.toISOString(),
        notes: form.notes.trim() || undefined,
        profileId: activeProfileId,
      };
      if (editing) {
        await updateHealthMeasurement({ ...editing, ...data });
        await loadMeasurements();
      } else await addMeasurement(data);
      setModal(false);
      setDatePicker(null);
      showToast(t("uxHealth.saved"), "success");
    } catch {
      setFieldError(t("uxHealth.saveError"));
    } finally {
      saveGuard.current = false;
      setSaving(false);
    }
  };
  const remove = (m: HealthMeasurement) =>
    Alert.alert(
      t("health.deleteTitle"),
      `${value(m)} · ${stamp(m.measuredAt)}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setBusyId(m.id);
            try {
              await deleteMeasurement(m.id);
              showToast(t("uxHealth.deleted"), "info");
            } catch {
              Alert.alert(t("common.error"), t("uxHealth.deleteError"));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  const openReminder = () => {
    const d = new Date();
    if (reminder) {
      const [h, m] = reminder.split(":").map(Number);
      d.setHours(h, m, 0, 0);
    }
    setReminderDraft(d);
    setReminderOpen(true);
    setReminderPicker(true);
  };
  const saveReminder = async () => {
    if (Platform.OS === "web") {
      Alert.alert(t("common.error"), t("uxHealth.reminderUnavailable"));
      return;
    }
    setReminderBusy(true);
    try {
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted)
        permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("common.error"), t("uxHealth.permissionNeeded"));
        return;
      }
      const time = format(reminderDraft, "HH:mm");
      await scheduleHealthReminder(time);
      setReminder(time);
      setReminderOpen(false);
      setReminderPicker(false);
      showToast(t("health.reminderSaved"), "success");
    } catch {
      Alert.alert(t("common.error"), t("uxHealth.saveError"));
    } finally {
      setReminderBusy(false);
    }
  };
  const checkin = (existing?: DailyCheckin) => {
    setEditCheckin(existing ?? todayCheckin);
    setCheckinVisible(true);
  };
  const button =
    "min-h-[48px] min-w-[48px] rounded-2xl items-center justify-center px-4 py-3";
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Text className="text-xs uppercase tracking-widest text-muted">
              {t("health.title")}
            </Text>
            <Text className="text-2xl font-bold text-text mt-1">
              {type
                ? t(`health.${type}_name`)
                : t(
                    tab === "diary"
                      ? "health.tabDiary"
                      : "health.tabMeasurements"
                  )}
            </Text>
          </View>
          <ProfileChip />
        </View>
      </View>
      {type ? (
        <View className="flex-row px-5 gap-3 mb-3">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={() => {
              setType(null);
              setLimit(20);
            }}
            className={`${button} bg-card border border-border`}
          >
            <Ionicons name="arrow-back" size={20} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => open()}
            className={`${button} flex-1 bg-action`}
          >
            <Text className="text-white font-bold">
              {t("health.addButton", { defaultValue: t("health.saveButton") })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-row mx-5 mb-4 rounded-2xl bg-card border border-border p-1">
          {(["measurements", "diary"] as const).map((key) => (
            <TouchableOpacity
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              onPress={() => {
                setTab(key);
                setLimit(20);
              }}
              className={`${button} flex-1 ${tab === key ? "bg-action" : ""}`}
            >
              <Text
                className={`font-semibold ${
                  tab === key ? "text-white" : "text-muted"
                }`}
              >
                {t(
                  key === "diary" ? "health.tabDiary" : "health.tabMeasurements"
                )}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <ScrollView
        className="flex-1 px-5"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color={theme.primary} />
            <Text className="text-muted mt-3">{t("uxHealth.loading")}</Text>
          </View>
        ) : loadError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t("uxHealth.loadError")}
            actionLabel={t("uxHealth.retry")}
            onAction={() => void load()}
          />
        ) : tab === "measurements" ? (
          type ? (
            <>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {([7, 30, 90, null] as const).map((days) => (
                  <TouchableOpacity
                    key={days ?? "all"}
                    accessibilityRole="button"
                    accessibilityState={{ selected: range === days }}
                    onPress={() => {
                      setRange(days);
                      setLimit(20);
                    }}
                    className={`min-h-[48px] px-3 rounded-xl justify-center border ${
                      range === days
                        ? "bg-action border-primary"
                        : "bg-card border-border"
                    }`}
                  >
                    <Text
                      className={
                        range === days
                          ? "text-white font-semibold"
                          : "text-muted"
                      }
                    >
                      {days == null ? t("uxHealth.allRecords") : `${days} d`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {items.length > 1 && (
                <View className="bg-card border border-border rounded-2xl p-4 mb-5">
                  <Text className="text-base font-semibold text-text mb-2">
                    {t("health.chart")}
                  </Text>
                  <SimpleLineChart
                    data={chronological.map((m) => m.value1)}
                    data2={
                      type === "blood_pressure"
                        ? chronological.map((m) => m.value2 ?? m.value1)
                        : undefined
                    }
                    timestamps={chronological.map((m) => m.measuredAt)}
                    unit={t(`health.${type}_unit`)}
                    width={Math.max(160, width - 72)}
                    height={160}
                  />
                  {type === "blood_pressure" && (
                    <Text className="text-xs text-muted mt-3">
                      {t("health.blood_pressure_field1")} ━ ·{" "}
                      {t("health.blood_pressure_field2")} ┄
                    </Text>
                  )}
                </View>
              )}
              <Text
                accessibilityRole="header"
                className="font-semibold text-text mb-3"
              >
                {t("uxHealth.chartTable")} · {items.length}
              </Text>
              {!items.length && (
                <EmptyState
                  icon={ICONS[type]}
                  title={t("uxHealth.noResults")}
                  actionLabel={t("health.addButton", {
                    defaultValue: t("health.saveButton"),
                  })}
                  onAction={() => open()}
                />
              )}
              {items.slice(0, limit).map((m) => (
                <View
                  key={m.id}
                  className="bg-card border border-border rounded-2xl p-4 mb-3"
                >
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text className="text-xl font-bold text-text">
                        {value(m)}
                      </Text>
                      <Text className="text-sm text-muted mt-1">
                        {stamp(m.measuredAt)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("uxHealth.editMeasurement")}
                      onPress={() => open(m)}
                      className="min-h-[48px] min-w-[48px] items-center justify-center"
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={20}
                        color={theme.primary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("uxHealth.deleteNamed", {
                        name: `${value(m)}, ${stamp(m.measuredAt)}`,
                      })}
                      disabled={busyId === m.id}
                      onPress={() => remove(m)}
                      className="min-h-[48px] min-w-[48px] items-center justify-center"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={theme.danger}
                      />
                    </TouchableOpacity>
                  </View>
                  {m.notes && (
                    <Text className="text-sm text-muted mt-3">{m.notes}</Text>
                  )}
                </View>
              ))}
              {items.length > limit && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setLimit((n) => n + 20)}
                  className={`${button} bg-card border border-border`}
                >
                  <Text className="text-primary font-semibold">
                    {t("uxHealth.showing", {
                      shown: limit,
                      total: items.length,
                    })}{" "}
                    · {t("uxHealth.showMore")}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {TYPES.map((metric) => {
                const latest = sorted.find((m) => m.type === metric);
                const mini = sorted
                  .filter((m) => m.type === metric)
                  .slice(0, 10)
                  .reverse();
                return (
                  <TouchableOpacity
                    key={metric}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`health.${metric}_name`)}, ${
                      latest
                        ? `${value(latest)}, ${stamp(latest.measuredAt)}`
                        : t("uxHealth.noMeasurementsYet")
                    }`}
                    onPress={() => {
                      setType(metric);
                      setLimit(20);
                    }}
                    className="bg-card border border-border rounded-2xl p-4 mb-3 flex-row items-center gap-3"
                  >
                    <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
                      <Ionicons
                        name={ICONS[metric]}
                        size={24}
                        color={theme.primary}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-text">
                        {t(`health.${metric}_name`)}
                      </Text>
                      <Text className="text-xl font-bold text-text mt-1">
                        {latest ? value(latest) : "—"}
                      </Text>
                      <Text className="text-xs text-muted mt-1">
                        {latest
                          ? stamp(latest.measuredAt)
                          : t("uxHealth.noMeasurementsYet")}
                      </Text>
                    </View>
                    {mini.length > 1 && (
                      <SimpleLineChart
                        data={mini.map((m) => m.value1)}
                        timestamps={mini.map((m) => m.measuredAt)}
                        width={56}
                        height={36}
                        mini
                      />
                    )}
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.muted}
                    />
                  </TouchableOpacity>
                );
              })}
              <View className="bg-card border border-border rounded-2xl p-4 mt-3">
                <Text className="font-semibold text-text">
                  {t("health.reminderSection")}
                </Text>
                <Text className="text-sm text-muted mt-1 mb-3">
                  {reminder
                    ? `${t("uxHealth.dailyReminder")} · ${formatTimeForDisplay(
                        reminder
                      )}`
                    : t("health.reminderNone")}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={openReminder}
                  className={`${button} bg-primary/10`}
                >
                  <Text className="text-primary font-semibold">
                    {t("uxHealth.editReminder")}
                  </Text>
                </TouchableOpacity>
                {reminder && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={reminderBusy}
                    onPress={async () => {
                      setReminderBusy(true);
                      try {
                        await cancelHealthReminder();
                        setReminder(null);
                        showToast(t("health.reminderCancelled"), "info");
                      } catch {
                        Alert.alert(t("common.error"), t("uxHealth.saveError"));
                      } finally {
                        setReminderBusy(false);
                      }
                    }}
                    className={button}
                  >
                    <Text className="text-muted">
                      {t("uxHealth.noNotifications")}
                    </Text>
                  </TouchableOpacity>
                )}
                {reminderOpen && (
                  <View className="mt-3">
                    <Text className="text-text font-semibold">
                      {formatTimeForDisplay(format(reminderDraft, "HH:mm"))}
                    </Text>
                    {reminderPicker && (
                      <DateTimePicker
                        value={reminderDraft}
                        mode="time"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(event, date) => {
                          if (Platform.OS !== "ios") setReminderPicker(false);
                          if (event.type === "set" && date)
                            setReminderDraft(date);
                        }}
                      />
                    )}
                    <View className="flex-row gap-2 mt-3">
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => {
                          setReminderOpen(false);
                          setReminderPicker(false);
                        }}
                        className={`${button} flex-1 bg-card border border-border`}
                      >
                        <Text className="text-muted">{t("common.cancel")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={reminderBusy}
                        onPress={() => void saveReminder()}
                        className={`${button} flex-1 bg-action`}
                      >
                        <Text className="text-white font-semibold">
                          {t("common.save")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </>
          )
        ) : (
          <>
            <View className="bg-card border border-border rounded-2xl p-5 mb-5">
              <Text className="text-xl font-bold text-text">
                {todayCheckin
                  ? `${MOODS[todayCheckin.mood]} ${t("checkin.alreadyDone")}`
                  : t("checkin.homePromptTitle")}
              </Text>
              <Text className="text-sm text-muted mt-2">
                {todayCheckin
                  ? t(`checkin.mood_${todayCheckin.mood}`)
                  : t("checkin.homePromptSubtitle")}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => checkin()}
                className={`${button} bg-action mt-4`}
              >
                <Text className="text-white font-bold">
                  {t(todayCheckin ? "checkin.editToday" : "checkin.saveButton")}
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              accessibilityRole="header"
              className="font-semibold text-text mb-3"
            >
              {t("uxHealth.allRecords")}
            </Text>
            {!pastCheckins.length && (
              <Text className="text-sm text-muted py-4">
                {t("uxHealth.emptyDiary")}
              </Text>
            )}
            {pastCheckins.slice(0, limit).map((c) => (
              <TouchableOpacity
                key={c.id}
                accessibilityRole="button"
                onPress={() => checkin(c)}
                className="bg-card border border-border rounded-2xl p-4 mb-3"
              >
                <Text className="text-base font-semibold text-text">
                  {MOODS[c.mood]}{" "}
                  {format(new Date(c.date + "T12:00"), "PPP", {
                    locale: getDateLocale(),
                  })}
                </Text>
                <Text className="text-sm text-muted mt-2">
                  {t(`checkin.mood_${c.mood}`)} ·{" "}
                  {c.symptoms
                    .map((s) =>
                      t(`checkin.symptom_${s}`, {
                        defaultValue: s.replace(/_/g, " "),
                      })
                    )
                    .join(", ") || t("uxHealth.noSymptoms")}
                </Text>
                {c.notes && (
                  <Text className="text-sm text-muted mt-2">{c.notes}</Text>
                )}
              </TouchableOpacity>
            ))}
            {pastCheckins.length > limit && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setLimit((n) => n + 20)}
                className={`${button} bg-card border border-border`}
              >
                <Text className="text-primary">
                  {t("uxHealth.showing", {
                    shown: limit,
                    total: pastCheckins.length,
                  })}{" "}
                  · {t("uxHealth.showMore")}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
      <Modal
        visible={modal}
        transparent
        animationType="slide"
        onRequestClose={dismiss}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end bg-black/50"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            accessibilityViewIsModal
            className="bg-background rounded-t-3xl max-h-[90%]"
          >
            <ScrollView
              className="px-5"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: 24,
                paddingBottom: Math.max(insets.bottom, 16) + 16,
              }}
            >
              <Text
                accessibilityRole="header"
                className="text-xl font-bold text-text mb-5"
              >
                {editing
                  ? t("uxHealth.editMeasurement")
                  : type
                  ? t(`health.${type}_name`)
                  : ""}
              </Text>
              <Text className="text-sm text-muted mb-3">
                {t("uxHealth.unit")}: {type ? t(`health.${type}_unit`) : ""}
              </Text>
              <Text className="text-sm text-text font-semibold mb-2">
                {type === "blood_pressure"
                  ? t("health.blood_pressure_field1")
                  : t("health.latestValue")}
              </Text>
              <TextInput
                accessibilityLabel={
                  type ? t(`health.${type}_field1`) : t("health.latestValue")
                }
                autoFocus
                keyboardType="decimal-pad"
                value={form.value1}
                onChangeText={(v) => {
                  setForm((f) => ({ ...f, value1: v }));
                  setFieldError(null);
                }}
                className="bg-card border border-border rounded-2xl px-4 py-3 text-text text-lg mb-4"
              />
              {type === "blood_pressure" && (
                <>
                  <Text className="text-sm text-text font-semibold mb-2">
                    {t("health.blood_pressure_field2")}
                  </Text>
                  <TextInput
                    accessibilityLabel={t("health.blood_pressure_field2")}
                    keyboardType="decimal-pad"
                    value={form.value2}
                    onChangeText={(v) => {
                      setForm((f) => ({ ...f, value2: v }));
                      setFieldError(null);
                    }}
                    className="bg-card border border-border rounded-2xl px-4 py-3 text-text text-lg mb-4"
                  />
                </>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setDatePicker("date")}
                className={`${button} bg-card border border-border mb-2`}
              >
                <Text className="text-text">
                  {format(form.measuredAt, "PPP", { locale: getDateLocale() })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setDatePicker("time")}
                className={`${button} bg-card border border-border mb-4`}
              >
                <Text className="text-text">
                  {formatTimeForDisplay(format(form.measuredAt, "HH:mm"))}
                </Text>
              </TouchableOpacity>
              {datePicker && (
                <DateTimePicker
                  value={form.measuredAt}
                  mode={datePicker}
                  maximumDate={new Date()}
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    if (Platform.OS !== "ios") setDatePicker(null);
                    if (event.type === "set" && date)
                      setForm((f) => {
                        const d = new Date(f.measuredAt);
                        if (datePicker === "date")
                          d.setFullYear(
                            date.getFullYear(),
                            date.getMonth(),
                            date.getDate()
                          );
                        else d.setHours(date.getHours(), date.getMinutes());
                        return { ...f, measuredAt: d };
                      });
                  }}
                />
              )}
              <Text className="text-sm text-text font-semibold mb-2">
                {t("health.fieldNotes")}
              </Text>
              <TextInput
                accessibilityLabel={t("health.fieldNotes")}
                multiline
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                className="bg-card border border-border rounded-2xl px-4 py-3 text-text text-base min-h-[80px] mb-4"
              />
              {fieldError && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className="text-danger text-sm mb-4"
                >
                  {fieldError}
                </Text>
              )}
              <View className="flex-row gap-3">
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={dismiss}
                  className={`${button} flex-1 bg-card border border-border`}
                >
                  <Text className="text-muted">{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ busy: saving, disabled: saving }}
                  disabled={saving}
                  onPress={() => void save()}
                  className={`${button} flex-1 bg-action`}
                >
                  <Text className="text-white font-bold">
                    {t(saving ? "common.saving" : "common.save")}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <CheckinModal
        visible={checkinVisible}
        existing={editCheckin}
        onClose={() => setCheckinVisible(false)}
      />
      <AdBanner screen="health" />
    </SafeAreaView>
  );
}
