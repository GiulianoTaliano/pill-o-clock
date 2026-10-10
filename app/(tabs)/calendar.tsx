import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState, useCallback, useRef } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  format,
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
  addMonths,
  subDays,
} from "date-fns";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAppStore } from "../../src/store";
import type { DoseLog, TodayDose } from "../../src/types";
import {
  getDoseLogsByDateRange,
  setDoseInjectionSite,
} from "../../src/db/database";
import {
  getLocalizedDosage,
  toDateString,
  formatTimeForDisplay,
  isScheduleActiveOnDate,
} from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { effectiveDoseDateTime } from "../../src/services/doseTime";
import { buildCalendarDoses } from "../../src/services/calendarAgenda";
import { getActiveProfileId } from "../../src/services/profileStore";
import { DoseCard } from "../../components/DoseCard";
import { AppointmentMiniCard } from "../../components/AppointmentMiniCard";
import { SitePickerModal } from "../../components/SitePickerModal";
import { ProfileChip } from "../../components/ProfileChip";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../src/context/ToastContext";

export default function CalendarScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const meds = useAppStore((s) => s.medications),
    schedules = useAppStore((s) => s.schedules),
    appointments = useAppStore((s) => s.appointments),
    snoozes = useAppStore((s) => s.snoozedTimes);
  const profile = useAppStore((s) => s.activeProfileId);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const mark = useAppStore((s) => s.markDose),
    snooze = useAppStore((s) => s.snoozeDose),
    revert = useAppStore((s) => s.revertDose),
    note = useAppStore((s) => s.updateDoseNote),
    reschedule = useAppStore((s) => s.rescheduleOnce);
  const revertSnooze = useAppStore((s) => s.revertSnooze);
  const selectedAppt = useAppStore((s) => s.setSelectedAppointmentId);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => toDateString(new Date()));
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [site, setSite] = useState<TodayDose | null>(null);
  const [timeDose, setTimeDose] = useState<TodayDose | null>(null);
  const request = useRef(0);
  const action = useRef(false);
  const load = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const [records] = await Promise.all([
        getDoseLogsByDateRange(
          toDateString(subDays(startOfMonth(month), 1)),
          toDateString(endOfMonth(month))
        ),
        loadAppointments(),
      ]);
      if (token === request.current && getActiveProfileId() === profile) {
        const ids = new Set(
          useAppStore.getState().medications.map((m) => m.id)
        );
        setLogs(records.filter((l) => ids.has(l.medicationId)));
      }
    } catch {
      if (token === request.current) setError(true);
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [month, loadAppointments, profile]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        request.current++;
      };
    }, [load])
  );
  const now = toDateString(new Date()),
    doses = buildCalendarDoses(meds, schedules, logs, selected, snoozes),
    dayAppointments = appointments
      .filter((a) => a.date === selected)
      .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const perform = async (dose: TodayDose, operation: () => Promise<void>) => {
    if (action.current) return;
    action.current = true;
    setBusy(`${dose.schedule.id}-${dose.scheduledDate}`);
    try {
      await operation();
      await load();
      showToast(
        t("common.saved", { defaultValue: t("uxHealth.complete") }),
        "success"
      );
    } finally {
      action.current = false;
      setBusy(null);
    }
  };
  const move = (amount: number) => {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelected(
      format(next, "yyyy-MM") === format(new Date(), "yyyy-MM")
        ? now
        : toDateString(next)
    );
  };
  const reset = () => {
    setMonth(startOfMonth(new Date()));
    setSelected(now);
  };
  const padding = (month.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(padding).fill(null),
    ...Array.from({ length: getDaysInMonth(month) }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const headers = t("calendar.dayHeaders", { returnObjects: true }) as string[];
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-2">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          className="w-12 h-12 bg-card border border-border rounded-2xl items-center justify-center"
        >
          <Ionicons name="arrow-back" size={22} color={theme.primary} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-text flex-1">
          {t("calendar.title")}
        </Text>
        <ProfileChip />
      </View>
      <View className="px-5 flex-row items-center gap-2 mb-3">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("uxHealth.previousMonth")}
          onPress={() => move(-1)}
          className="w-12 h-12 bg-card border border-border rounded-2xl justify-center items-center"
        >
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
        </TouchableOpacity>
        <Text className="flex-1 text-base font-semibold text-text text-center capitalize">
          {format(month, "MMMM yyyy", { locale: getDateLocale() })}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("uxHealth.nextMonth")}
          onPress={() => move(1)}
          className="w-12 h-12 bg-card border border-border rounded-2xl justify-center items-center"
        >
          <Ionicons name="chevron-forward" size={20} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={reset}
          className="min-h-[48px] px-3 justify-center"
        >
          <Text className="text-primary font-semibold">
            {t("calendar.today")}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
      >
        <View className="flex-row mb-2">
          {headers.map((h, i) => (
            <Text
              key={i}
              className="flex-1 text-xs text-center text-muted font-semibold"
            >
              {h}
            </Text>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} className="flex-row mb-1">
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              if (!day) return <View key={col} className="flex-1" />;
              const d = new Date(month.getFullYear(), month.getMonth(), day);
              const ds = toDateString(d);
              const count = appointments.filter((a) => a.date === ds).length;
              const hasMedication =
                ds < now
                  ? logs.some((l) => l.scheduledDate === ds)
                  : schedules.some((s) => {
                      const m = meds.find((x) => x.id === s.medicationId);
                      return m && isScheduleActiveOnDate(s, d, m);
                    });
              return (
                <TouchableOpacity
                  key={col}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ds === selected }}
                  accessibilityLabel={`${format(d, "PPPP", {
                    locale: getDateLocale(),
                  })}, ${
                    hasMedication ? t("medications.title") : ""
                  }, ${count} ${t("appointments.title")}`}
                  onPress={() => setSelected(ds)}
                  className={`flex-1 min-h-[48px] rounded-xl items-center justify-center ${
                    ds === selected
                      ? "bg-action"
                      : ds === now
                      ? "bg-primary/10"
                      : ""
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      ds === selected ? "text-white" : "text-text"
                    }`}
                  >
                    {day}
                  </Text>
                  <Text
                    className={`text-xs ${
                      ds === selected ? "text-white" : "text-primary"
                    }`}
                  >
                    {hasMedication ? "●" : " "}
                    {count ? " ◆" : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <Text className="text-xs text-muted mt-2 mb-5">
          {t("uxHealth.calendarLegend")}
        </Text>
        <View className="border-t border-border pt-4 mb-4">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-text"
          >
            {format(new Date(selected + "T12:00"), "PPP", {
              locale: getDateLocale(),
            })}
          </Text>
          <Text className="text-sm text-muted mt-2">
            {t("uxHealth.daySummary", {
              doses: doses.length,
              appointments: dayAppointments.length,
            })}
          </Text>
        </View>
        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator color={theme.primary} />
            <Text className="text-muted mt-2">{t("uxHealth.loading")}</Text>
          </View>
        ) : error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title={t("uxHealth.loadError")}
            actionLabel={t("uxHealth.retry")}
            onAction={() => void load()}
          />
        ) : (
          <>
            {!!dayAppointments.length && (
              <View className="mb-4">
                <Text
                  accessibilityRole="header"
                  className="font-semibold text-text mb-3"
                >
                  {t("appointments.title")}
                </Text>
                {dayAppointments.map((appt) => (
                  <AppointmentMiniCard
                    key={appt.id}
                    appt={appt}
                    onPress={() => selectedAppt(appt.id)}
                  />
                ))}
              </View>
            )}
            {selected < now && (
              <Text className="text-sm text-muted leading-5 mb-4">
                {t("uxHealth.readOnlyPast")}
              </Text>
            )}
            {doses.map((dose) =>
              selected === now && !dose.medication.isPRN ? (
                <View
                  key={`${dose.schedule.id}-${dose.scheduledDate}`}
                  pointerEvents={
                    busy === `${dose.schedule.id}-${dose.scheduledDate}`
                      ? "none"
                      : "auto"
                  }
                >
                  {busy === `${dose.schedule.id}-${dose.scheduledDate}` && (
                    <ActivityIndicator color={theme.primary} />
                  )}
                  <DoseCard
                    dose={dose}
                    onTake={() => perform(dose, () => mark(dose, "taken"))}
                    onSkip={(reason) =>
                      perform(dose, () =>
                        mark(dose, "skipped", undefined, reason)
                      )
                    }
                    onSnooze={(minutes) =>
                      perform(dose, () => snooze(dose, minutes))
                    }
                    onRevert={() =>
                      perform(dose, () =>
                        dose.snoozedUntil &&
                        dose.status !== "taken" &&
                        dose.status !== "skipped"
                          ? revertSnooze(dose)
                          : revert(dose)
                      )
                    }
                    onReschedule={() => setTimeDose(dose)}
                    onUpdateNote={(value) =>
                      perform(dose, () =>
                        note(dose.schedule.id, dose.scheduledDate, value)
                      )
                    }
                    onSetSite={() => setSite(dose)}
                  />
                </View>
              ) : (
                <View
                  key={`${dose.schedule.id}-${dose.scheduledDate}`}
                  className="bg-card border border-border rounded-2xl p-4 mb-3"
                >
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-text">
                        {dose.medication.name}
                      </Text>
                      <Text className="text-sm text-muted mt-1">
                        {getLocalizedDosage(dose.medication, t)}
                      </Text>
                    </View>
                    <Text className="text-primary font-semibold">
                      {formatTimeForDisplay(dose.scheduledTime)}
                    </Text>
                  </View>
                  <Text className="text-sm text-text mt-3">
                    {t(`status.${dose.status}`)}
                  </Text>
                  {dose.takenAt && (
                    <Text className="text-sm text-muted mt-1">
                      {t("uxHealth.takenAt")}{" "}
                      {format(new Date(dose.takenAt), "Pp", {
                        locale: getDateLocale(),
                      })}
                    </Text>
                  )}
                  {dose.notes && (
                    <Text className="text-sm text-muted mt-2">
                      {dose.notes}
                    </Text>
                  )}
                  {dose.skipReason && (
                    <Text className="text-sm text-muted mt-2">
                      {t(`doseCard.skipReason_${dose.skipReason}`)}
                    </Text>
                  )}
                  {dose.injectionSite && (
                    <Text className="text-sm text-muted mt-2">
                      {t(`sites.${dose.injectionSite}`)}
                    </Text>
                  )}
                </View>
              )
            )}
            {!doses.length && !dayAppointments.length && (
              <EmptyState
                icon="calendar-outline"
                title={t("uxHealth.noResults")}
              />
            )}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/appointments",
                  params: { date: selected },
                })
              }
              className="bg-card border border-border min-h-[48px] rounded-2xl p-3 items-center mt-4"
            >
              <Text className="text-primary font-semibold">
                {t("uxHealth.newForDate")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <SitePickerModal
        visible={!!site}
        suggested={null}
        current={site?.injectionSite}
        onClose={() => setSite(null)}
        onPick={async (value) => {
          if (site) {
            const current = site;
            try {
              await perform(current, () =>
                setDoseInjectionSite(
                  current.schedule.id,
                  current.scheduledDate,
                  value
                )
              );
              setSite(null);
            } catch {
              Alert.alert(t("common.error"), t("uxHealth.saveError"));
            }
          }
        }}
      />
      {timeDose && (
        <DateTimePicker
          mode="time"
          value={effectiveDoseDateTime(
            timeDose.scheduledDate,
            timeDose.scheduledTime,
            timeDose.snoozedUntil
          )}
          onChange={(event, date) => {
            const dose = timeDose;
            setTimeDose(null);
            if (event.type === "set" && date)
              void perform(dose, () =>
                reschedule(dose, format(date, "HH:mm"))
              ).catch(() =>
                Alert.alert(t("common.error"), t("uxHealth.saveError"))
              );
          }}
        />
      )}
    </SafeAreaView>
  );
}
