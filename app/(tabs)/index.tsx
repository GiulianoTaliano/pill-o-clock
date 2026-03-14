import { View, Text, ScrollView, TouchableOpacity, RefreshControl, LayoutAnimation, Platform, Modal, PanResponder, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { storage } from "../../src/storage";
import { STORAGE_KEYS } from "../../src/config";
import { useAppStore } from "../../src/store";
import { useTodaySchedule } from "../../src/hooks/useTodaySchedule";
import { useAdherenceStreak } from "../../src/hooks/useAdherenceStreak";
import { DoseCard } from "../../components/DoseCard";
import { EmptyState } from "../../components/EmptyState";
import { CheckinModal } from "../../components/CheckinModal";
import { CopilotStep, walkthroughable, useCopilot } from "react-native-copilot";
import { TodayDose, SkipReason } from "../../src/types";
import { CATEGORY_CONFIG, getColorConfig } from "../../src/utils";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useToast } from "../../src/context/ToastContext";
import { updateWidget } from "expo-widget";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const loadTodayLogs = useAppStore((s) => s.loadTodayLogs);
  const markDose = useAppStore((s) => s.markDose);
  const snoozeDose = useAppStore((s) => s.snoozeDose);
  const rescheduleOnce = useAppStore((s) => s.rescheduleOnce);
  const revertDose = useAppStore((s) => s.revertDose);
  const revertSnooze = useAppStore((s) => s.revertSnooze);
  const updateDoseNote = useAppStore((s) => s.updateDoseNote);
  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const loadDailyCheckins = useAppStore((s) => s.loadDailyCheckins);
  const medications = useAppStore((s) => s.medications);
  const todayLogs = useAppStore((s) => s.todayLogs);
  const logPRNDose = useAppStore((s) => s.logPRNDose);
  const [refreshing, setRefreshing] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<TodayDose | null>(null);

  const reschedulePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) setRescheduleTarget(null); },
    })
  ).current;
  const [pickerDraft, setPickerDraft] = useState<Date>(new Date());
  const [checkinVisible, setCheckinVisible] = useState(false);
  const [checkinDismissed, setCheckinDismissed] = useState(false);
  // default true avoids a flash on first render; useEffect corrects it after MMKV read
  const [tipSeen, setTipSeen] = useState(true);
  const doses = useTodaySchedule();
  const streak = useAdherenceStreak();

  // ── In-app tour ────────────────────────────────────────────────────────────
  const TOUR_DONE_KEY = STORAGE_KEYS.TOUR_DONE;
  const tourShownRef = useRef(false);
  const copilot = useCopilot();

  const WalkthroughableView = useRef(walkthroughable(View)).current;

  // Keep a ref to always access the latest copilot.start — the context value
  // (and thus copilot.start) is recreated whenever CopilotStep components
  // register, so a stale closure would call a `start` that sees zero steps.
  const copilotRef = useRef(copilot);
  useEffect(() => { copilotRef.current = copilot; }, [copilot]);

  // Mark tour complete when copilot stops
  useEffect(() => {
    const handler = () => { storage.set(TOUR_DONE_KEY, "1"); };
    copilot.copilotEvents.on("stop", handler);
    return () => { copilot.copilotEvents.off("stop", handler); };
  }, [copilot.copilotEvents]);

  // Trigger once, the first time this screen is focused after onboarding
  useFocusEffect(
    useCallback(() => {
      if (tourShownRef.current) return;
      // Only start the tour after onboarding is complete — the home screen
      // mounts briefly before the redirect to onboarding, and starting the
      // copilot there would leave it in a stale "active" state with no steps.
      if (
        !storage.getString(TOUR_DONE_KEY) &&
        storage.getString(STORAGE_KEYS.ONBOARDING_DONE)
      ) {
        tourShownRef.current = true;
        // Delay so layout is complete and CopilotStep refs are measured.
        // Read from ref to get the latest `start` that knows about all
        // registered steps (the context recreates start on each register).
        setTimeout(() => {
          copilotRef.current.start();
        }, 800);
      }
    }, [])
  );

  useEffect(() => {
    if (!storage.getString(STORAGE_KEYS.TIP_RESCHEDULE_SEEN)) setTipSeen(false);
  }, []);

  // Keep the Android home-screen widget in sync with the current dose list.
  useEffect(() => {
    const nextPending = doses.find((d) => d.status === "pending");
    const allDone = doses.length > 0 && doses.every((d) => d.status === "taken" || d.status === "skipped");
    updateWidget({
      name:    nextPending?.medication.name ?? null,
      time:    nextPending?.scheduledTime  ?? null,
      allDone,
    });
  }, [doses]);

  useFocusEffect(
    useCallback(() => {
      loadDailyCheckins();
      const todayKey = format(new Date(), "yyyy-MM-dd");
      setCheckinDismissed(storage.getString(STORAGE_KEYS.CHECKIN_DISMISSED_DATE) === todayKey);
    }, [loadDailyCheckins])
  );

  const openReschedule = (dose: TodayDose) => {
    const base = dose.snoozedUntil ?? dose.scheduledTime;
    const [h, m] = base.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setPickerDraft(d);
    setRescheduleTarget(dose);
  };

  const dismissTip = () => {
    setTipSeen(true);
    storage.set(STORAGE_KEYS.TIP_RESCHEDULE_SEEN, "1");
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

  // PRN medications have no schedules; show them in a separate section
  const prnMeds = medications.filter((m) => m.isPRN && m.isActive);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const today = format(new Date(), "PPP", { locale: getDateLocale() });
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);
  const todayCheckin = dailyCheckins.find((c) => c.date === todayStr);
  const showCheckinPrompt = !todayCheckin && !checkinDismissed;

  const handleRefresh = async () => {
    setRefreshing(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await loadTodayLogs();
    setRefreshing(false);
  };

  const handleMarkDose = (dose: TodayDose, status: "taken" | "skipped", skipReason?: SkipReason) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    markDose(dose, status, undefined, skipReason);
  };

  const handleSnooze = (dose: TodayDose) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    snoozeDose(dose);
    showToast(t('doseCard.snoozeConfirm'), 'info');
  };

  const handleRevert = (dose: TodayDose) => {
    revertDose(dose);
  };

  const handleRevertSnooze = (dose: TodayDose) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    revertSnooze(dose);
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
        <View className="flex-row gap-2 items-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('history.title')}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/history"); }}
            className="bg-card border border-border w-10 h-10 rounded-full items-center justify-center shadow-sm"
          >
            <Ionicons name="bar-chart-outline" size={20} color="#4f9cff" />
          </TouchableOpacity>
          <CopilotStep
            text="tour.step1Title||tour.step1Desc"
            order={1}
            name="addButton"
          >
            <WalkthroughableView>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('form.addButton')}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/medication/new"); }}
                className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </WalkthroughableView>
          </CopilotStep>
        </View>
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
        {/* Check-in prompt */}
        {showCheckinPrompt && (
          <View className="flex-row items-center gap-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-2xl px-4 py-3 mt-1 mb-2">
            <Text className="text-2xl">🌡</Text>
            <View className="flex-1">
              <Text className="text-sm font-bold text-teal-800 dark:text-teal-300">{t("checkin.homePromptTitle")}</Text>
              <Text className="text-xs text-teal-600 dark:text-teal-400">{t("checkin.homePromptSubtitle")}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCheckinVisible(true); }}
                className="bg-teal-500 rounded-xl px-3 py-1.5"
              >
                <Text className="text-white text-xs font-bold">{t("checkin.saveButton")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const todayKey = format(new Date(), "yyyy-MM-dd");
                  storage.set(STORAGE_KEYS.CHECKIN_DISMISSED_DATE, todayKey);
                  setCheckinDismissed(true);
                }}
                className="p-1"
              >
                <Ionicons name="close" size={14} color="#5eead4" />
              </TouchableOpacity>
            </View>
          </View>
        )}
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
                    onSkip={(reason) => handleMarkDose(dose, "skipped", reason)}
                    onSnooze={() => handleSnooze(dose)}
                    onReschedule={() => openReschedule(dose)}
                    onRevert={dose.snoozedUntil ? () => handleRevertSnooze(dose) : undefined}
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
                    onSkip={(reason) => handleMarkDose(dose, "skipped", reason)}
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
                    onSkip={(reason) => handleMarkDose(dose, "skipped", reason)}
                    onSnooze={() => handleSnooze(dose)}
                    onRevert={() => handleRevert(dose)}
                    onUpdateNote={(note) => handleUpdateNote(dose, note)}
                  />
                ))}
              </>
            )}

            {/* PRN (on-demand) medications */}
            {prnMeds.length > 0 && (
              <>
                {(pending.length > 0 || missed.length > 0 || done.length > 0) && (
                  <View className="h-px bg-border my-3" />
                )}
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                  {t('home.sectionPRN')}
                </Text>
                {prnMeds.map((med) => {
                  const colors = getColorConfig(med.color);
                  const todayDoseCount = todayLogs.filter(
                    (l) => l.medicationId === med.id && l.scheduledDate === todayStr && l.status === "taken"
                  ).length;
                  return (
                    <View
                      key={med.id}
                      style={{ borderLeftColor: colors.bg }}
                      className="flex-row items-center bg-card rounded-2xl border border-border border-l-4 px-4 py-3 mb-2 shadow-sm"
                    >
                      <View
                        style={{ backgroundColor: colors.light }}
                        className="w-9 h-9 rounded-full items-center justify-center mr-3"
                      >
                        <Ionicons name="medical" size={18} color={colors.bg} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-text">{med.name}</Text>
                        <Text className="text-xs text-muted">{med.dosage}</Text>
                        {todayDoseCount > 0 && (
                          <Text className="text-xs text-green-600 dark:text-green-400 mt-0.5 font-medium">
                            ×{todayDoseCount} {t('status.taken').toLowerCase()}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          logPRNDose(med);
                        }}
                        style={{ backgroundColor: colors.bg }}
                        className="rounded-xl px-3 py-2"
                      >
                        <Text className="text-white text-xs font-bold">{t('home.prnLogDose')}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}
            <View className="h-6" />
          </>
        )}
      </ScrollView>

      {/* Reschedule: modal sheet on iOS for full context; native picker on Android */}
      {rescheduleTarget && Platform.OS === "ios" && (
        <Modal transparent animationType="fade" visible>
          <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setRescheduleTarget(null)}>
            <Pressable onPress={() => {}} className="bg-background rounded-t-3xl px-6 pt-5 pb-10">
              {/* Handle + context header */}
              <View className="items-center mb-1" {...reschedulePan.panHandlers}>
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
            </Pressable>
          </Pressable>
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

      <CheckinModal
        visible={checkinVisible}
        onClose={() => setCheckinVisible(false)}
      />
    </SafeAreaView>
  );
}
