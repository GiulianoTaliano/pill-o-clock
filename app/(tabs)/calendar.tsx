import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useEffect, useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useSkeletonAnimation, SkeletonBox } from "../../components/Skeleton";
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
import { Appointment, DoseLog, TodayDose, TodayDoseStatus } from "../../src/types";
import { getDoseLogsByDateRange } from "../../src/db/database";
import {
  isScheduleActiveOnDate,
  getColorConfig,
  CATEGORY_CONFIG,
  getCategoryLabel,
  today,
  toDateString,
  parseTime,
} from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useAppTheme } from "../../src/hooks/useAppTheme";

// ─── Calendar grid skeleton ───────────────────────────────────────────────

function CalendarGridSkeleton({ rows }: { rows: number }) {
  const anim = useSkeletonAnimation();
  return (
    <Animated.View style={anim}>
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} className="flex-row mb-1">
          {Array.from({ length: 7 }).map((_, col) => (
            <SkeletonBox
              key={col}
              style={{ flex: 1, height: 42, marginHorizontal: 2, borderRadius: 12 }}
            />
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

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

// ─── Appointment mini-card ─────────────────────────────────────────────────────

// Kept as a top-level component (same reasoning as ApptMiniCard, SubTabButton
// in other screens) so that react-native-css-interop's upgrade-warning path
// cannot crawl the CalendarScreen closure and hit React Navigation's context.
function ApptMiniCard({
  appt,
  onPress,
}: {
  appt: Appointment;
  onPress: () => void;
}) {
  const dateLabel = format(new Date(appt.date + "T12:00"), "PPP", { locale: getDateLocale() });
  const dateCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-card rounded-2xl border border-border p-3 mb-2 flex-row items-center gap-3"
    >
      <View className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
        <Ionicons name="calendar" size={17} color="#4f9cff" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text" numberOfLines={1}>{appt.title}</Text>
        <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
          {dateCap}{appt.time ? ` · ${appt.time}` : ""}{appt.doctor ? ` · ${appt.doctor}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const medications = useAppStore((s) => s.medications);
  const schedules   = useAppStore((s) => s.schedules);
  const markDose    = useAppStore((s) => s.markDose);
  const appointments    = useAppStore((s) => s.appointments);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const setSelectedAppointmentId = useAppStore((s) => s.setSelectedAppointmentId);

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
      loadAppointments();
    }, [loadMonthLogs, loadAppointments])
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
        // Prefer the time stored in the log — it reflects any snooze that was
        // active when the dose was marked taken/skipped.
        scheduledTime: log?.scheduledTime ?? sched.time,
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

  const todayDate = today();
  const upcomingAppts = appointments
    .filter((a) => a.date >= todayDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const handleMarkDose = async (dose: TodayDose, status: "taken" | "skipped") => {
    await markDose(dose, status);
    await loadMonthLogs();
  };

  // ── Month navigation ──────────────────────────────────────────────────

  const handlePrevMonth = () => {
    const newMonth = subMonths(currentMonth, 1);
    const newMonthStr = format(newMonth, "yyyy-MM");
    const todayMonthStr = format(new Date(), "yyyy-MM");
    setCurrentMonth(newMonth);
    setSelectedDate(
      newMonthStr === todayMonthStr
        ? toDateString(new Date())
        : toDateString(startOfMonth(newMonth))
    );
  };

  const handleNextMonth = () => {
    const newMonth = addMonths(currentMonth, 1);
    const newMonthStr = format(newMonth, "yyyy-MM");
    const todayMonthStr = format(new Date(), "yyyy-MM");
    setCurrentMonth(newMonth);
    setSelectedDate(
      newMonthStr === todayMonthStr
        ? toDateString(new Date())
        : toDateString(startOfMonth(newMonth))
    );
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
          onPress={handlePrevMonth}
          className="p-2 bg-card rounded-xl border border-border"
        >
          <Ionicons name="chevron-back" size={18} color="#4f9cff" />
        </TouchableOpacity>

        <Text className="text-base font-bold text-text capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: getDateLocale() })}
        </Text>

        <TouchableOpacity
          onPress={handleNextMonth}
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
          <CalendarGridSkeleton rows={cells.length / 7} />
        ) : (
          Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} className="flex-row mb-1">
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) return <View key={col} className="flex-1 mx-0.5" />;

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
                      <Text className="text-muted text-xs font-semibold">
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

        {/* ── UPCOMING APPOINTMENTS ──────────────────────────────────── */}
        <View className="border-t border-border mt-2 mb-4" />
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-bold text-text">{t('appointments.upcomingSection')}</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/appointments");
            }}
            className="bg-primary w-8 h-8 rounded-full items-center justify-center"
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        {upcomingAppts.length === 0 ? (
          <View className="py-6 items-center">
            <Ionicons name="calendar-outline" size={26} color="#cbd5e1" />
            <Text className="text-muted text-xs mt-2 text-center">{t('appointments.noAppointments')}</Text>
          </View>
        ) : (
          <>
            {upcomingAppts.slice(0, 3).map((appt) => (
              <ApptMiniCard
                key={appt.id}
                appt={appt}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedAppointmentId(appt.id);
                }}
              />
            ))}
            {upcomingAppts.length > 3 && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(tabs)/appointments");
                }}
                className="items-center py-2"
              >
                <Text className="text-primary text-sm font-semibold">
                  {t('appointments.viewAll', { count: upcomingAppts.length })}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}
