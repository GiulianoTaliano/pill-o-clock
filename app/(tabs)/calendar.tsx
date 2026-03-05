import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  format,
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
  getDay,
  addMonths,
  subMonths,
  isToday as dfIsToday,
} from "date-fns";
import { useAppStore } from "../../src/store";
import { DoseLog, TodayDose, TodayDoseStatus } from "../../src/types";
import { getDoseLogsByDateRange } from "../../src/db/database";
import {
  isScheduleActiveOnDate,
  MEDICATION_COLORS,
  getColorConfig,
  CATEGORY_CONFIG,
  getCategoryLabel,
  toDateString,
  parseTime,
} from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useAppTheme } from "../../src/hooks/useAppTheme";

// ─── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TodayDoseStatus }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { bg, color } = theme.statusBadge[status];
  return (
    <View style={{ backgroundColor: bg }} className="rounded-lg px-2 py-0.5">
      <Text style={{ color }} className="text-xs font-semibold">
        {t(`status.${status}`)}
      </Text>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { t } = useTranslation();
  const medications = useAppStore((s) => s.medications);
  const schedules   = useAppStore((s) => s.schedules);
  const markDose    = useAppStore((s) => s.markDose);

  const DAY_HEADERS = t("calendar.dayHeaders", { returnObjects: true }) as string[];

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date())
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    toDateString(new Date())
  );
  const [monthLogs, setMonthLogs] = useState<DoseLog[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Load dose logs for the visible month ──────────────────────────────

  const loadMonthLogs = useCallback(async () => {
    setLoading(true);
    try {
      const from = toDateString(startOfMonth(currentMonth));
      const to   = toDateString(endOfMonth(currentMonth));
      const logs = await getDoseLogsByDateRange(from, to);
      setMonthLogs(logs);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadMonthLogs();
  }, [loadMonthLogs]);

  // Reload every time this tab gains focus (after marking doses on Home tab)
  useFocusEffect(
    useCallback(() => {
      loadMonthLogs();
    }, [loadMonthLogs])
  );

  // ── Grid computation ──────────────────────────────────────────────────

  const year         = currentMonth.getFullYear();
  const month        = currentMonth.getMonth(); // 0-based
  const daysInMonth  = getDaysInMonth(currentMonth);

  // Adjust getDay() to Mon-first (Mon=0 … Sun=6)
  const rawDow     = getDay(startOfMonth(currentMonth)); // 0=Sun
  const paddingDays = rawDow === 0 ? 6 : rawDow - 1;

  const cells: (number | null)[] = [
    ...Array<null>(paddingDays).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ── Dots per day ──────────────────────────────────────────────────────

  const medMap = new Map(medications.map((m) => [m.id, m]));

  function getDotsForDay(day: number): string[] {
    const date = new Date(year, month, day);
    const seen = new Set<string>();
    const colors: string[] = [];
    for (const sched of schedules) {
      const med = medMap.get(sched.medicationId);
      if (!med) continue;
      if (!isScheduleActiveOnDate(sched, date, med)) continue;
      const hex = getColorConfig(med.color).bg;
      if (!seen.has(hex)) {
        seen.add(hex);
        colors.push(hex);
      }
    }
    return colors.slice(0, 4);
  }

  // ── Doses for the selected day ────────────────────────────────────────

  const logMap = new Map(
    monthLogs.map((l) => [`${l.scheduleId}-${l.scheduledDate}`, l])
  );

  function getDosesForDate(dateStr: string): TodayDose[] {
    const [y, mo, d] = dateStr.split("-").map(Number);
    const date = new Date(y, mo - 1, d);
    const now  = new Date();
    const isToday = dateStr === toDateString(now);

    const doses: TodayDose[] = [];

    for (const sched of schedules) {
      const med = medMap.get(sched.medicationId);
      if (!med) continue;
      if (!isScheduleActiveOnDate(sched, date, med)) continue;

      const key = `${sched.id}-${dateStr}`;
      const log = logMap.get(key);

      let status: TodayDoseStatus;
      if (log) {
        status = log.status;
      } else if (isToday) {
        const { hours, minutes } = parseTime(sched.time);
        const fire = new Date(y, mo - 1, d, hours, minutes);
        status = fire < now ? "missed" : "pending";
      } else {
        status = date < now ? "missed" : "pending";
      }

      doses.push({
        doseLogId: log?.id,
        medication: med,
        schedule: sched,
        scheduledDate: dateStr,
        scheduledTime: sched.time,
        status,
        takenAt: log?.takenAt,
      });
    }

    doses.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    return doses;
  }

  const selectedDoses  = getDosesForDate(selectedDate);
  const [sy, sm, sd]   = selectedDate.split("-").map(Number);
  const selDateObj     = new Date(sy, sm - 1, sd);
  const isSelectedToday = selectedDate === toDateString(new Date());

  const handleMarkDose = async (dose: TodayDose, status: "taken" | "skipped") => {
    await markDose(dose, status);
    await loadMonthLogs();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-1">
        <Text className="text-2xl font-black text-text">{t('calendar.title')}</Text>
      </View>

      {/* Month navigator */}
      <View className="px-5 py-2 flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="p-2 bg-card rounded-xl border border-border"
        >
          <Ionicons name="chevron-back" size={18} color="#4f9cff" />
        </TouchableOpacity>

        <Text className="text-base font-bold text-text capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: getDateLocale() })}
        </Text>

        <TouchableOpacity
          onPress={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="p-2 bg-card rounded-xl border border-border"
        >
          <Ionicons name="chevron-forward" size={18} color="#4f9cff" />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View className="flex-row px-3 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <View key={i} className="flex-1 items-center">
            <Text className="text-xs font-bold text-muted">{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View className="px-3 mb-2">
        {loading ? (
          <View className="h-44 items-center justify-center">
            <ActivityIndicator color="#4f9cff" />
          </View>
        ) : (
          Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} className="flex-row mb-1">
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) return <View key={col} className="flex-1" />;

                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSelected  = dateStr === selectedDate;
                const isTodayCell = dfIsToday(new Date(year, month, day));
                const dots        = getDotsForDay(day);

                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setSelectedDate(dateStr)}
                    className={`flex-1 items-center justify-center py-1.5 mx-0.5 rounded-xl ${
                      isSelected
                        ? "bg-primary"
                        : isTodayCell
                        ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                        : ""
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        isSelected
                          ? "text-white"
                          : isTodayCell
                          ? "text-primary"
                          : "text-text"
                      }`}
                    >
                      {day}
                    </Text>
                    {/* Medication dots */}
                    <View className="flex-row gap-0.5 mt-0.5 h-2 items-center justify-center">
                      {dots.map((color, i) => (
                        <View
                          key={i}
                          style={{
                            backgroundColor: isSelected ? "rgba(255,255,255,0.8)" : color,
                          }}
                          className="w-1.5 h-1.5 rounded-full"
                        />
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </View>

      {/* Divider */}
      <View className="border-t border-border mx-5 mb-3" />

      {/* Selected day label */}
      <View className="px-5 mb-2 flex-row items-center gap-2">
        <Text className="text-sm font-bold text-text capitalize">
          {format(selDateObj, "PPP", { locale: getDateLocale() })}
        </Text>
        {isSelectedToday && (
          <View className="bg-primary rounded-lg px-2 py-0.5">
            <Text className="text-white text-xs font-bold">{t('calendar.today')}</Text>
          </View>
        )}
      </View>

      {/* Dose list for selected day */}
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
      >
        {selectedDoses.length === 0 ? (
          <View className="py-10 items-center">
            <Ionicons name="checkmark-circle-outline" size={36} color="#cbd5e1" />
            <Text className="text-muted text-sm mt-2 text-center">
              {t('calendar.noDosesSubtitle')}
            </Text>
          </View>
        ) : (
          selectedDoses.map((dose) => {
            const colors   = getColorConfig(dose.medication.color);
            const catCfg   = CATEGORY_CONFIG[dose.medication.category];
            const canAct   = isSelectedToday && (dose.status === "pending" || dose.status === "missed");

            return (
              <View
                key={`${dose.schedule.id}-${dose.scheduledDate}`}
                style={{ borderLeftColor: colors.bg }}
                className="bg-card rounded-2xl border border-border border-l-4 p-4 mb-3"
              >
                {/* Row: icon + name + time/status */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2 flex-1">
                    <View
                      style={{ backgroundColor: colors.light }}
                      className="w-9 h-9 rounded-full items-center justify-center"
                    >
                      <Ionicons
                        name={catCfg.icon as any}
                        size={18}
                        color={colors.bg}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-text">
                        {dose.medication.name}
                      </Text>
                      <Text className="text-xs text-muted">
                        {dose.medication.dosage} · {getCategoryLabel(dose.medication.category, t)}
                      </Text>
                    </View>
                  </View>

                  <View className="items-end gap-1.5">
                    <Text className="text-sm font-bold text-primary">
                      {dose.scheduledTime}
                    </Text>
                    <StatusBadge status={dose.status} />
                  </View>
                </View>

                {/* Notes */}
                {dose.medication.notes ? (
                  <Text className="text-xs text-muted mt-2 ml-11">
                    {dose.medication.notes}
                  </Text>
                ) : null}

                {/* Action buttons — today only */}
                {canAct && (
                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity
                      onPress={() => handleMarkDose(dose, "skipped")}
                      className="flex-row items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
                    >
                      <Ionicons name="close-outline" size={14} color="#64748b" />
                      <Text className="text-slate-500 text-xs font-semibold">
                        {t('status.skipped')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleMarkDose(dose, "taken")}
                      className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
                    >
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text className="text-white text-xs font-bold">
                        {dose.status === "missed" ? t('status.taken') : t('status.taken')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
