import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useAppStore } from "../../src/store";
import { useTodaySchedule } from "../../src/hooks/useTodaySchedule";
import { DoseCard } from "../../components/DoseCard";
import { EmptyState } from "../../components/EmptyState";
import { TodayDose } from "../../src/types";
import { CATEGORY_CONFIG } from "../../src/utils";
import { useState } from "react";
import { useTranslation, getDateLocale } from "../../src/i18n";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const loadAll = useAppStore((s) => s.loadAll);
  const markDose = useAppStore((s) => s.markDose);
  const snoozeDose = useAppStore((s) => s.snoozeDose);
  const [refreshing, setRefreshing] = useState(false);
  const doses = useTodaySchedule();

  // Sort by category priority (ascending) then time within each group
  const byPriorityThenTime = (a: TodayDose, b: TodayDose) => {
    const pa = CATEGORY_CONFIG[a.medication.category].priority;
    const pb = CATEGORY_CONFIG[b.medication.category].priority;
    if (pa !== pb) return pa - pb;
    return a.scheduledTime.localeCompare(b.scheduledTime);
  };

  const pending  = doses.filter((d) => d.status === "pending").sort(byPriorityThenTime);
  const missed   = doses.filter((d) => d.status === "missed").sort(byPriorityThenTime);
  const done     = doses.filter((d) => d.status === "taken" || d.status === "skipped");

  const today = format(new Date(), "PPP", { locale: getDateLocale() });
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-start justify-between">
        <View>
          <Text className="text-2xl font-black text-text">{t('home.title')}</Text>
          <Text className="text-sm text-muted mt-0.5">{todayCap}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/medication/new")}
          className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Summary chips */}
      <View className="px-5 py-3 flex-row gap-2 flex-wrap">
        <View className="bg-amber-100 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
          <Ionicons name="time-outline" size={14} color="#d97706" />
          <Text className="text-amber-700 text-xs font-bold">{t('home.chipPending', { count: pending.length })}</Text>
        </View>
        <View className="bg-green-100 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
          <Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" />
          <Text className="text-green-700 text-xs font-bold">{t('home.chipTaken', { count: done.filter(d => d.status === 'taken').length })}</Text>
        </View>
        {done.filter(d => d.status === "skipped").length > 0 && (
          <View className="bg-red-100 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
            <Ionicons name="close-circle-outline" size={14} color="#dc2626" />
            <Text className="text-red-600 text-xs font-bold">{t('home.chipSkipped', { count: done.filter(d => d.status === 'skipped').length })}</Text>
          </View>
        )}
        {missed.length > 0 && (
          <View className="bg-slate-100 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
            <Ionicons name="alert-circle-outline" size={14} color="#64748b" />
            <Text className="text-slate-600 text-xs font-bold">{t('home.chipMissed', { count: missed.length })}</Text>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4f9cff" />
        }
        showsVerticalScrollIndicator={false}
      >
        {doses.length === 0 ? (
          <EmptyState
            icon="medical-outline"
            title={t('home.noMeds')}
            subtitle={t('home.noMedsSubtitle')}
          />
        ) : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2 mt-2">
                  {t('home.sectionPending')}
                </Text>
                {pending.map((dose) => (
                  <DoseCard
                    key={`${dose.schedule.id}-${dose.scheduledDate}`}
                    dose={dose}
                    onTake={() => markDose(dose, "taken")}
                    onSkip={() => markDose(dose, "skipped")}
                    onSnooze={() => snoozeDose(dose)}
                  />
                ))}
              </>
            )}

            {/* Missed */}
            {missed.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2 mt-4">
                  {t('home.sectionMissed')}
                </Text>
                {missed.map((dose) => (
                  <DoseCard
                    key={`${dose.schedule.id}-${dose.scheduledDate}`}
                    dose={dose}
                    onTake={() => markDose(dose, "taken")}
                    onSkip={() => markDose(dose, "skipped")}
                    onSnooze={() => snoozeDose(dose)}
                  />
                ))}
              </>
            )}

            {/* Done */}
            {done.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2 mt-4">
                  {t('home.sectionDone')}
                </Text>
                {done.map((dose) => (
                  <DoseCard
                    key={`${dose.schedule.id}-${dose.scheduledDate}`}
                    dose={dose}
                    onTake={() => markDose(dose, "taken")}
                    onSkip={() => markDose(dose, "skipped")}
                    onSnooze={() => snoozeDose(dose)}
                  />
                ))}
              </>
            )}
            <View className="h-6" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
