import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { format, subDays, startOfDay } from "date-fns";
import { useAppStore } from "../../src/store";
import { DoseLog, Medication } from "../../src/types";
import { MEDICATION_COLORS, toDateString } from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";

const STATUS_CONFIG = {
  taken:   { color: "#16a34a", bg: "#dcfce7", icon: "checkmark-circle" as const },
  skipped: { color: "#dc2626", bg: "#fee2e2", icon: "close-circle" as const },
  pending: { color: "#d97706", bg: "#fef3c7", icon: "time" as const },
};

export default function HistoryScreen() {
  const { t } = useTranslation();
  const medications = useAppStore((s) => s.medications);
  const getHistoryLogs = useAppStore((s) => s.getHistoryLogs);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [offset, setOffset] = useState(0); // days back from today
  const RANGE = 7;

  const toDate = subDays(startOfDay(new Date()), offset * RANGE);
  const fromDate = subDays(toDate, RANGE - 1);
  const fromStr = toDateString(fromDate);
  const toStr = toDateString(toDate);

  const loadLogs = useCallback(() => {
    getHistoryLogs(fromStr, toStr).then(setLogs);
  }, [fromStr, toStr]);

  // Reload when date range changes
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reload every time this tab gains focus (e.g. after marking a dose on Home)
  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [loadLogs])
  );

  const medMap = new Map<string, Medication>(medications.map((m) => [m.id, m]));

  // Group logs by date
  const byDate = new Map<string, DoseLog[]>();
  for (const log of logs) {
    const key = log.scheduledDate;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(log);
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  // Stats
  const totalTaken = logs.filter((l) => l.status === "taken").length;
  const totalSkipped = logs.filter((l) => l.status === "skipped").length;
  const adherence =
    logs.length > 0 ? Math.round((totalTaken / logs.length) * 100) : null;

  const rangeLabel = `${format(fromDate, "d MMM", { locale: getDateLocale() })} – ${format(toDate, "d MMM yyyy", { locale: getDateLocale() })}`;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-black text-text">{t('history.title')}</Text>
      </View>

      {/* Range Navigator */}
      <View className="px-5 py-2 flex-row items-center justify-between">
        <TouchableOpacity
          onPress={() => setOffset((o) => o + 1)}
          className="p-2 bg-white rounded-xl border border-slate-100"
        >
          <Ionicons name="chevron-back" size={18} color="#4f9cff" />
        </TouchableOpacity>

        <View className="items-center">
          <Text className="text-sm font-bold text-text">{rangeLabel}</Text>
          {adherence !== null && (
            <Text className="text-xs text-muted">{t('history.adherence', { value: adherence })}</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          className={`p-2 bg-white rounded-xl border border-slate-100 ${offset === 0 ? "opacity-30" : ""}`}
        >
          <Ionicons name="chevron-forward" size={18} color="#4f9cff" />
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View className="flex-row px-5 gap-2 mb-3">
        <View className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-3 items-center">
          <Text className="text-2xl font-black text-green-600">{totalTaken}</Text>
          <Text className="text-xs text-green-700 font-medium">{t('history.taken')}</Text>
        </View>
        <View className="flex-1 bg-red-50 border border-red-100 rounded-2xl p-3 items-center">
          <Text className="text-2xl font-black text-red-500">{totalSkipped}</Text>
          <Text className="text-xs text-red-600 font-medium">{t('history.skipped')}</Text>
        </View>
        {adherence !== null && (
          <View className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-3 items-center">
            <Text className="text-2xl font-black text-blue-500">{adherence}%</Text>
            <Text className="text-xs text-blue-600 font-medium">{t('history.adherenceLabel')}</Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
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
                  const colors = med ? MEDICATION_COLORS[med.color] : MEDICATION_COLORS.blue;
                  const statusCfg = STATUS_CONFIG[log.status];

                  return (
                    <View
                      key={log.id}
                      className="flex-row items-center bg-white rounded-2xl border border-slate-100 px-4 py-3 mb-2 shadow-sm"
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
                      </View>
                      <View
                        style={{ backgroundColor: statusCfg.bg }}
                        className="rounded-xl px-2 py-1 flex-row items-center gap-1"
                      >
                        <Ionicons name={statusCfg.icon} size={12} color={statusCfg.color} />
                        <Text style={{ color: statusCfg.color }} className="text-xs font-semibold">
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
      </ScrollView>
    </SafeAreaView>
  );
}
