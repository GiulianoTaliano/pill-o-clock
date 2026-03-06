import { View, Text, ScrollView, TouchableOpacity, RefreshControl, LayoutAnimation, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppStore } from "../../src/store";
import { useTodaySchedule } from "../../src/hooks/useTodaySchedule";
import { useAdherenceStreak } from "../../src/hooks/useAdherenceStreak";
import { DoseCard } from "../../components/DoseCard";
import { EmptyState } from "../../components/EmptyState";
import { TodayDose } from "../../src/types";
import { CATEGORY_CONFIG } from "../../src/utils";
import { useEffect, useState } from "react";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useToast } from "../../src/context/ToastContext";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const loadAll = useAppStore((s) => s.loadAll);
  const markDose = useAppStore((s) => s.markDose);
  const snoozeDose = useAppStore((s) => s.snoozeDose);
  const rescheduleOnce = useAppStore((s) => s.rescheduleOnce);
  const revertDose = useAppStore((s) => s.revertDose);
  const updateDoseNote = useAppStore((s) => s.updateDoseNote);
  const [refreshing, setRefreshing] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<TodayDose | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(new Date());
  // default true avoids a flash on first render; useEffect corrects it after AsyncStorage read
  const [tipSeen, setTipSeen] = useState(true);
  const doses = useTodaySchedule();
  const streak = useAdherenceStreak();

  useEffect(() => {
    AsyncStorage.getItem("@pilloclock/tip_reschedule_seen").then((val) => {
      if (!val) setTipSeen(false);
    });
  }, []);

  const openReschedule = (dose: TodayDose) => {
    const base = dose.snoozedUntil ?? dose.scheduledTime;
    const [h, m] = base.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setPickerDraft(d);
    setRescheduleTarget(dose);
  };

  const dismissTip = async () => {
    setTipSeen(true);
    await AsyncStorage.setItem("@pilloclock/tip_reschedule_seen", "1");
  };

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await loadAll();
    setRefreshing(false);
  };

  const handleMarkDose = (dose: TodayDose, status: "taken" | "skipped") => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    markDose(dose, status);
  };

  const handleSnooze = (dose: TodayDose) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    snoozeDose(dose);
    showToast(t('doseCard.snoozeConfirm'), 'info');
  };

  const handleRevert = (dose: TodayDose) => {
    revertDose(dose);
  };

  const handleUpdateNote = (dose: TodayDose, note: string) => {
    updateDoseNote(dose.schedule.id, dose.scheduledDate, note);
  };

  const handleRescheduleChange = (_: DateTimePickerEvent, date?: Date) => {
    // Android: the picker closes on selection; capture target before clearing it
    const target = rescheduleTarget;
    setRescheduleTarget(null);
    if (!date || !target) return;
    const newTime = format(date, "HH:mm");
    rescheduleOnce(target, newTime);
    showToast(t('doseCard.rescheduleConfirm', { time: newTime }), 'info');
  };

  const handlePickerDraftChange = (_: DateTimePickerEvent, date?: Date) => {
    if (date) setPickerDraft(date);
  };

  const handleConfirmReschedule = () => {
    if (!rescheduleTarget) return;
    const newTime = format(pickerDraft, "HH:mm");
    rescheduleOnce(rescheduleTarget, newTime);
    showToast(t('doseCard.rescheduleConfirm', { time: newTime }), 'info');
    setRescheduleTarget(null);
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
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/medication/new"); }}
          className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Summary chips */}
      <View className="px-5 py-3 flex-row gap-2 flex-wrap">
        <View className="bg-amber-100 dark:bg-amber-900/30 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
          <Ionicons name="time-outline" size={14} color="#d97706" />
          <Text className="text-amber-700 dark:text-amber-400 text-xs font-bold">{t('home.chipPending', { count: pending.length })}</Text>
        </View>
        <View className="bg-green-100 dark:bg-green-900/30 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
          <Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" />
          <Text className="text-green-700 dark:text-green-400 text-xs font-bold">{t('home.chipTaken', { count: done.filter(d => d.status === 'taken').length })}</Text>
        </View>
        {done.filter(d => d.status === "skipped").length > 0 && (
          <View className="bg-red-100 dark:bg-red-900/30 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
            <Ionicons name="close-circle-outline" size={14} color="#dc2626" />
            <Text className="text-red-600 dark:text-red-400 text-xs font-bold">{t('home.chipSkipped', { count: done.filter(d => d.status === 'skipped').length })}</Text>
          </View>
        )}
        {missed.length > 0 && (
          <View className="bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
            <Ionicons name="alert-circle-outline" size={14} color="#64748b" />
            <Text className="text-slate-600 dark:text-slate-400 text-xs font-bold">{t('home.chipMissed', { count: missed.length })}</Text>
          </View>
        )}
        {streak >= 1 && (
          <View className="bg-orange-100 dark:bg-orange-900/30 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
            <Text className="text-orange-700 dark:text-orange-400 text-xs font-bold">
              {t('home.streak', { count: streak })}
            </Text>
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
            {/* One-time reschedule tip */}
            {!tipSeen && pending.length > 0 && (
              <TouchableOpacity
                onPress={dismissTip}
                activeOpacity={0.8}
                className="flex-row items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl px-4 py-3 mb-3 mt-2"
              >
                <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
                <Text className="text-sm text-blue-700 dark:text-blue-300 flex-1 leading-5">
                  {t('home.tipReschedule')}
                </Text>
                <Ionicons name="close-outline" size={16} color="#93c5fd" />
              </TouchableOpacity>
            )}

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
                    onTake={() => handleMarkDose(dose, "taken")}
                    onSkip={() => handleMarkDose(dose, "skipped")}
                    onSnooze={() => handleSnooze(dose)}
                    onReschedule={() => openReschedule(dose)}
                  />
                ))}
              </>
            )}

            {/* Separator missed */}
            {pending.length > 0 && missed.length > 0 && (
              <View className="h-px bg-border my-3" />
            )}

            {/* Missed */}
            {missed.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                  {t('home.sectionMissed')}
                </Text>
                {missed.map((dose) => (
                  <DoseCard
                    key={`${dose.schedule.id}-${dose.scheduledDate}`}
                    dose={dose}
                    onTake={() => handleMarkDose(dose, "taken")}
                    onSkip={() => handleMarkDose(dose, "skipped")}
                    onSnooze={() => handleSnooze(dose)}
                  />
                ))}
              </>
            )}

            {/* Separator done */}
            {(pending.length > 0 || missed.length > 0) && done.length > 0 && (
              <View className="h-px bg-border my-3" />
            )}

            {/* Done */}
            {done.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                  {t('home.sectionDone')}
                </Text>
                {done.map((dose) => (
                  <DoseCard
                    key={`${dose.schedule.id}-${dose.scheduledDate}`}
                    dose={dose}
                    onTake={() => handleMarkDose(dose, "taken")}
                    onSkip={() => handleMarkDose(dose, "skipped")}
                    onSnooze={() => handleSnooze(dose)}
                    onRevert={() => handleRevert(dose)}
                    onUpdateNote={(note) => handleUpdateNote(dose, note)}
                  />
                ))}
              </>
            )}
            <View className="h-6" />
          </>
        )}
      </ScrollView>

      {/* Reschedule: modal sheet on iOS for full context; native picker on Android */}
      {rescheduleTarget && Platform.OS === "ios" && (
        <Modal transparent animationType="fade" visible>
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-background rounded-t-3xl px-6 pt-5 pb-10">
              {/* Handle + context header */}
              <View className="items-center mb-1">
                <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mb-5" />
                <Text className="text-sm text-muted">{t('doseCard.rescheduleTitle')}</Text>
                <Text className="text-xl font-bold text-text mt-1">
                  {rescheduleTarget.medication.name}
                </Text>
                <Text className="text-sm text-muted mt-0.5">
                  {t('doseCard.rescheduleOriginal', { time: rescheduleTarget.scheduledTime })}
                </Text>
              </View>

              {/* Spinner */}
              <DateTimePicker
                value={pickerDraft}
                mode="time"
                is24Hour
                display="spinner"
                onChange={handlePickerDraftChange}
              />

              {/* Actions */}
              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity
                  onPress={() => setRescheduleTarget(null)}
                  className="flex-1 py-3.5 border border-border rounded-2xl items-center"
                >
                  <Text className="font-semibold text-muted">{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmReschedule}
                  className="flex-1 py-3.5 bg-primary rounded-2xl items-center"
                >
                  <Text className="font-bold text-white">{t('common.confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {rescheduleTarget && Platform.OS !== "ios" && (
        <DateTimePicker
          value={pickerDraft}
          mode="time"
          is24Hour
          display="default"
          onChange={handleRescheduleChange}
        />
      )}
    </SafeAreaView>
  );
}
