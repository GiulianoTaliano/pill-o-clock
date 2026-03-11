import { View, Text, ScrollView, TouchableOpacity, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  addDays, addMonths, eachDayOfInterval, format, getDaysInMonth,
  startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { useAppStore } from "../../src/store";
import { DoseLog, Medication } from "../../src/types";
import { getColorConfig, toDateString } from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { useSkeletonAnimation, SkeletonBox } from "../../components/Skeleton";

const STATUS_ICONS = {
  taken:   "checkmark-circle" as const,
  skipped: "close-circle" as const,
  pending: "time" as const,
  missed:  "alert-circle-outline" as const,
};

// ─── Heatmap cell ──────────────────────────────────────────────────────────

function dayAdherenceColor(dayLogs: DoseLog[] | undefined): string {
  if (!dayLogs || dayLogs.length === 0) return "transparent";
  const taken   = dayLogs.filter((l) => l.status === "taken").length;
  const counted = dayLogs.filter((l) => l.status !== "pending").length;
  if (counted === 0) return "transparent";
  const pct = taken / counted;
  if (pct === 1) return "#22c55e";   // all taken → green
  if (pct >= 0.5) return "#f97316"; // partial → orange
  return "#ef4444";                  // mostly missed/skipped → red
}
// ─── Skeleton components ─────────────────────────────────────────────────────────────

function HistoryStatsSkeleton() {
  const anim = useSkeletonAnimation();
  return (
    <Animated.View style={[anim, { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 }]}>
      <SkeletonBox style={{ flex: 1, height: 72, borderRadius: 16 }} />
      <SkeletonBox style={{ flex: 1, height: 72, borderRadius: 16 }} />
      <SkeletonBox style={{ flex: 1, height: 72, borderRadius: 16 }} />
    </Animated.View>
  );
}

function HistoryHeatmapSkeleton({ rows, dayHeaders }: { rows: number; dayHeaders: string[] }) {
  const anim = useSkeletonAnimation();
  return (
    <View className="bg-card border border-border rounded-2xl p-4 mb-3 mx-5">
      <View className="flex-row mb-1">
        {dayHeaders.map((h, i) => (
          <Text key={i} className="flex-1 text-center text-xs text-muted font-semibold">{h}</Text>
        ))}
      </View>
      <Animated.View style={anim}>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <View key={rowIdx} className="flex-row mb-1">
            {Array.from({ length: 7 }).map((_, colIdx) => (
              <SkeletonBox key={colIdx} style={{ flex: 1, aspectRatio: 1, margin: 2, borderRadius: 8 }} />
            ))}
          </View>
        ))}
      </Animated.View>
      <View className="flex-row gap-3 mt-2 justify-center">
        {[{ color: "#22c55e", label: "100%" }, { color: "#f97316", label: "≥50%" }, { color: "#ef4444", label: "<50%" }]
          .map(({ color, label }) => (
            <View key={label} className="flex-row items-center gap-1">
              <View className="w-3 h-3 rounded-sm" style={{ backgroundColor: color + "cc" }} />
              <Text className="text-xs text-muted">{label}</Text>
            </View>
          ))}
      </View>
    </View>
  );
}

function HistoryLogRowSkeleton() {
  const anim = useSkeletonAnimation();
  return (
    <Animated.View style={anim}>
      <View className="flex-row items-center bg-card rounded-2xl border border-border px-4 py-3 mb-2">
        <SkeletonBox style={{ width: 36, height: 36, borderRadius: 18, marginRight: 12 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox style={{ height: 13, width: "60%", borderRadius: 6 }} />
          <SkeletonBox style={{ height: 11, width: "40%", borderRadius: 6 }} />
        </View>
        <SkeletonBox style={{ width: 56, height: 24, borderRadius: 10 }} />
      </View>
    </Animated.View>
  );
}
// ─── Screen ────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const medications = useAppStore((s) => s.medications);
  const getHistoryLogs = useAppStore((s) => s.getHistoryLogs);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0); // weeks (week view) or months (month view) back

  // ── Date ranges ─────────────────────────────────────────────────────────

  // Week view: ISO week (Monday–Sunday)
  const weekStart = startOfWeek(
    subWeeks(startOfDay(new Date()), offset),
    { weekStartsOn: 1 }
  );
  const weekEnd = addDays(weekStart, 6);

  // Month view: full calendar month
  const monthStart = startOfMonth(subMonths(new Date(), offset));
  const monthEnd = addDays(startOfMonth(addMonths(monthStart, 1)), -1);

  const fromDate = viewMode === "week" ? weekStart : monthStart;
  const toDate   = viewMode === "week" ? weekEnd   : monthEnd;
  const fromStr  = toDateString(fromDate);
  const toStr    = toDateString(toDate);

  const loadLogs = useCallback(() => {
    setLoading(true);
    getHistoryLogs(fromStr, toStr).then(setLogs).finally(() => setLoading(false));
  }, [fromStr, toStr, getHistoryLogs]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useFocusEffect(
    useCallback(() => { loadLogs(); }, [loadLogs])
  );

  // Reset offset when switching view modes
  const switchViewMode = (mode: "week" | "month") => {
    setOffset(0);
    setViewMode(mode);
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const medMap = new Map<string, Medication>(medications.map((m) => [m.id, m]));

  // Group logs by date
  const byDate = new Map<string, DoseLog[]>();
  for (const log of logs) {
    if (!byDate.has(log.scheduledDate)) byDate.set(log.scheduledDate, []);
    byDate.get(log.scheduledDate)!.push(log);
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  const totalTaken   = logs.filter((l) => l.status === "taken").length;
  const totalSkipped = logs.filter((l) => l.status === "skipped").length;
  const totalMissed  = logs.filter((l) => l.status === "missed").length;
  const counted      = logs.filter((l) => l.status !== "pending").length;
  const adherence    = counted > 0 ? Math.round((totalTaken / counted) * 100) : null;

  // ── Labels ─────────────────────────────────────────────────────────────────

  const rangeLabel = viewMode === "week"
    ? `${format(fromDate, "d MMM", { locale: getDateLocale() })} – ${format(toDate, "d MMM yyyy", { locale: getDateLocale() })}`
    : format(monthStart, "MMMM yyyy", { locale: getDateLocale() }).replace(/^\w/, (c) => c.toUpperCase());

  const DAY_HEADERS = t('calendar.dayHeaders', { returnObjects: true }) as string[];
  // Row count for the month heatmap — derived from monthStart, always available before loading
  const heatmapRowCount = Math.ceil((getDaysInMonth(monthStart) + (monthStart.getDay() + 6) % 7) / 7);

  // ── Month heatmap grid ────────────────────────────────────────────────────

  const MonthHeatmap = () => {
    // Build a 7-column (Mon-Sun) grid padded with null for empty cells
    const firstDayOfMonth = monthStart;
    const daysInMonth = getDaysInMonth(firstDayOfMonth);
    // Offset of first day from Monday (0=Mon … 6=Sun)
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const cells: (Date | null)[] = [
      ...Array(startOffset).fill(null),
      ...eachDayOfInterval({ start: firstDayOfMonth, end: monthEnd }),
    ];
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    const today = toDateString(new Date());

    return (
      <View className="bg-card border border-border rounded-2xl p-4 mb-3 mx-5">
        {/* Day-of-week headers */}
        <View className="flex-row mb-1">
          {DAY_HEADERS.map((h, i) => (
            <Text key={i} className="flex-1 text-center text-xs text-muted font-semibold">
              {h}
            </Text>
          ))}
        </View>
        {/* Rows of weeks */}
        {Array.from({ length: cells.length / 7 }).map((_, rowIdx) => (
          <View key={rowIdx} className="flex-row mb-1">
            {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
              if (!day) return <View key={colIdx} className="flex-1 aspect-square" />;
              const ds = toDateString(day);
              const dayLogs = byDate.get(ds);
              const bg = dayAdherenceColor(dayLogs);
              const isToday = ds === today;
              return (
                <View
                  key={colIdx}
                  className={`flex-1 aspect-square m-0.5 rounded-lg items-center justify-center ${isToday ? "border-2 border-primary" : ""}`}
                  style={bg !== "transparent" ? { backgroundColor: bg + "cc" } : { backgroundColor: "#f1f5f9" }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: bg !== "transparent" ? "#fff" : "#94a3b8" }}
                  >
                    {day.getDate()}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
        {/* Legend */}
        <View className="flex-row gap-3 mt-2 justify-center">
          {[
            { color: "#22c55e", label: "100%" },
            { color: "#f97316", label: "≥50%" },
            { color: "#ef4444", label: "<50%" },
          ].map(({ color, label }) => (
            <View key={label} className="flex-row items-center gap-1">
              <View className="w-3 h-3 rounded-sm" style={{ backgroundColor: color + "cc" }} />
              <Text className="text-xs text-muted">{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-black text-text">{t('history.title')}</Text>
        {/* Week / Month toggle */}
        <View className="flex-row bg-card border border-border rounded-xl overflow-hidden">
          <TouchableOpacity
            onPress={() => switchViewMode("week")}
            className={`px-3 py-1.5 ${viewMode === "week" ? "bg-primary" : ""}`}
          >
            <Text className={`text-xs font-bold ${viewMode === "week" ? "text-white" : "text-muted"}`}>
              {t('history.viewWeek')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => switchViewMode("month")}
            className={`px-3 py-1.5 ${viewMode === "month" ? "bg-primary" : ""}`}
          >
            <Text className={`text-xs font-bold ${viewMode === "month" ? "text-white" : "text-muted"}`}>
              {t('history.viewMonth')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Range Navigator */}
      <View className="px-5 py-2 flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => setOffset((o) => o + 1)}
          className="p-2 bg-card rounded-xl border border-border"
        >
          <Ionicons name="chevron-back" size={18} color="#4f9cff" />
        </TouchableOpacity>

        <View className="items-center">
          <Text className="text-sm font-bold text-text">{rangeLabel}</Text>
          {!loading && adherence !== null && (
            <Text className="text-xs text-muted">{t('history.adherence', { value: adherence })}</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          className={`p-2 bg-card rounded-xl border border-border ${offset === 0 ? "opacity-30" : ""}`}
        >
          <Ionicons name="chevron-forward" size={18} color="#4f9cff" />
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      {loading ? (
        <HistoryStatsSkeleton />
      ) : (
        <View className="flex-row px-5 gap-2 mb-3">
          <View className="flex-1 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-800/40 rounded-2xl p-3 items-center">
            <Text className="text-2xl font-black text-green-600 dark:text-green-400">{totalTaken}</Text>
            <Text className="text-xs text-green-700 dark:text-green-400 font-medium">{t('history.taken')}</Text>
          </View>
          <View className="flex-1 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800/40 rounded-2xl p-3 items-center">
            <Text className="text-2xl font-black text-red-500 dark:text-red-400">{totalSkipped + totalMissed}</Text>
            <Text className="text-xs text-red-600 dark:text-red-400 font-medium">{t('history.missed')}</Text>
          </View>
          {adherence !== null && (
            <View className="flex-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-3 items-center">
              <Text className="text-2xl font-black text-blue-500 dark:text-blue-400">{adherence}%</Text>
              <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">{t('history.adherenceLabel')}</Text>
            </View>
          )}
        </View>
      )}

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Month heatmap */}
        {viewMode === "month" && (
          loading
            ? <HistoryHeatmapSkeleton rows={heatmapRowCount} dayHeaders={DAY_HEADERS} />
            : <MonthHeatmap />
        )}

        {/* Log list */}
        {loading ? (
          <View className="px-5">
            {Array.from({ length: 4 }).map((_, i) => <HistoryLogRowSkeleton key={i} />)}
            <View className="h-6" />
          </View>
        ) : (
          <View className="px-5">
            {sortedDates.length === 0 ? (
            <View className="py-12 items-center">
              <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
              <Text className="text-muted text-sm mt-3 text-center">
                {t('history.noLogs')}
              </Text>
            </View>
          ) : (
            sortedDates.map((date) => {
              const dayLogs = byDate.get(date)!;
              const dateObj = new Date(date + "T12:00");
              const dayLabel = format(dateObj, "PPP", { locale: getDateLocale() });
              const dayLabelCap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

              return (
                <View key={date} className="mb-4">
                  <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                    {dayLabelCap}
                  </Text>
                  {dayLogs.map((log) => {
                    const med = medMap.get(log.medicationId);
                    const colors = getColorConfig(med?.color ?? "blue");
                    const statusBadge = theme.statusBadge[log.status as keyof typeof theme.statusBadge];

                    return (
                      <View
                        key={log.id}
                        className="flex-row items-center bg-card rounded-2xl border border-border px-4 py-3 mb-2 shadow-sm"
                      >
                        <View
                          style={{ backgroundColor: colors.light }}
                          className="w-9 h-9 rounded-full items-center justify-center mr-3"
                        >
                          <Ionicons name="medical" size={18} color={colors.bg} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-text">
                            {med?.name ?? "Medicamento"}
                          </Text>
                          <Text className="text-xs text-muted">
                            {log.scheduledTime} · {med?.dosage}
                          </Text>
                          {log.notes ? (
                            <View className="flex-row items-center gap-1 mt-0.5">
                              <Ionicons name="chatbubble-outline" size={11} color="#94a3b8" />
                              <Text className="text-xs text-muted italic flex-1" numberOfLines={1}>
                                {log.notes}
                              </Text>
                            </View>
                          ) : null}
                          {log.skipReason ? (
                            <View className="flex-row items-center gap-1 mt-0.5">
                              <Ionicons name="help-circle-outline" size={11} color="#94a3b8" />
                              <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                                {t(`doseCard.skipReason_${log.skipReason}` as any)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View
                          style={{ backgroundColor: statusBadge.bg }}
                          className="rounded-xl px-2 py-1 flex-row items-center gap-1"
                        >
                          <Ionicons name={STATUS_ICONS[log.status as keyof typeof STATUS_ICONS] ?? "time"} size={12} color={statusBadge.color} />
                          <Text style={{ color: statusBadge.color }} className="text-xs font-semibold">
                            {t(`status.${log.status}`)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}
          <View className="h-6" />
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
