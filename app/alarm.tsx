import { View, Text, Animated, TextInput, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../src/store";
import { getColorConfig, formatTimeForDisplay, getLocalizedDosage, isScheduleActiveOnDate } from "../src/utils";
import { SNOOZE_OPTIONS, getDefaultSnoozeMinutes } from "../src/services/snoozeSettings";
import { useTranslation } from "../src/i18n";
import { stopAlarm, setAlarmWindowFlags, clearAlarmWindowFlags } from "expo-alarm";
import { getMedications } from "../src/db/database";
import { speakDoseReminder, stopSpeaking } from "../src/services/tts";
import type { Medication } from "../src/types";
import { AppPressable } from "../components/AppPressable";
import { useAppTheme } from "../src/hooks/useAppTheme";

/**
 * Fullscreen alarm screen.
 * Opened via deep link: pilloclock://alarm?scheduleId=...&date=...
 *
 * Platform behaviour:
 *
 *  Android
 *   • Opened automatically by AlarmManager’s fullScreenIntent when the alarm
 *     fires, even when the screen is locked. setAlarmWindowFlags() keeps the
 *     activity visible above the lock screen and wakes the display.
 *   • AlarmAudioService streams alarm.wav on STREAM_ALARM (audible in silent
 *     mode) in a continuous loop until stopAlarm() is called.
 *
 *  iOS
 *   • fullScreenIntent and AlarmManager do not exist on iOS. This screen is
 *     only reached when the user taps the notification banner or a quick-action
 *     button (TAKEN / SNOOZE / SKIP). It is never auto-opened above lock screen.
 *   • setAlarmWindowFlags / stopAlarm are no-ops (platform-guarded in expo-alarm).
 *   • Sound plays once per notification delivery (≤30 s, iOS limit).
 *
 * When an `action` query param is present (sent by notification quick-action
 * buttons), the screen silently executes the action and navigates back
 * without rendering any UI.
 */
export default function AlarmScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { scheduleId, date, action, time } = useLocalSearchParams<{
    scheduleId: string;
    date: string;
    /** Set by AlarmActionReceiver: "taken" | "snooze" | "skipped" */
    action?: string;
    /** Actual fire time (HH:mm). May differ from schedule.time when the user
     *  used "reschedule once" from the Today screen. */
    time?: string;
  }>();

  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const isLoading = useAppStore((s) => s.isLoading);
  const markDose = useAppStore((s) => s.markDose);
  const snoozeDose = useAppStore((s) => s.snoozeDose);
  const [noteText, setNoteText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const todayLogs = useAppStore((s) => s.todayLogs);
  /** Co-due doses already confirmed from this screen (F3 group dose). */
  const [handledCo, setHandledCo] = useState<Record<string, "taken" | "skipped">>({});

  const schedule = schedules.find((s) => s.id === scheduleId);
  // CRITICAL (multi-profile): store.medications only holds the ACTIVE
  // profile, but alarms ring for every profile. Resolve meds from the DB so
  // a dependent's alarm renders instead of silently bailing out.
  const [allMeds, setAllMeds] = useState<Medication[] | null>(null);
  useEffect(() => {
    getMedications().then(setAllMeds).catch(() => setAllMeds([]));
  }, []);
  const medication = schedule
    ? (medications.find((m) => m.id === schedule.medicationId) ??
       allMeds?.find((m) => m.id === schedule.medicationId) ??
       null)
    : null;

  // Set lock-screen / wake-up window flags so the activity shows above the
  // lock screen exactly like a regular alarm clock.  Clear them on unmount
  // so they don't bleed into other app screens.
  useEffect(() => {
    setAlarmWindowFlags().catch(() => {});
    stopAlarm().catch(() => {}); // stop audio as soon as the screen mounts
    return () => {
      clearAlarmWindowFlags().catch(() => {});
      stopSpeaking(); // cut any ongoing spoken reminder (F4 TTS)
    };
  }, []);

  // Spoken reminder (F4 TTS, opt-in): read the med + dose aloud once the
  // alarm audio stopped and the med is resolved. Never on quick-actions.
  const spokeRef = useRef(false);
  useEffect(() => {
    if (action || !medication || spokeRef.current) return;
    spokeRef.current = true;
    speakDoseReminder(medication.name, getLocalizedDosage(medication, t));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medication, action]);

  // Block the hardware back button while the alarm screen is active.
  // This also suppresses the Android 14+ predictive back gesture preview
  // (via OnBackPressedDispatcher) so the user cannot accidentally dismiss
  // the alarm screen without explicitly taking an action.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Navigate back if data is unavailable — but only after the store has
  // finished loading to avoid false-negatives on cold start.
  useEffect(() => {
    if (isLoading || allMeds === null) return; // store/DB not ready, don't bail
    if (!medication || !schedule) {
      stopAlarm().catch(() => {});
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
  }, [isLoading, allMeds, medication, schedule, router]);

  const pendingDose = schedule && medication ? {
    medication,
    schedule,
    scheduledDate: date,
    // Use the URL-supplied time when present (set by the native alarm module)
    // so that a rescheduled dose records the correct time, not the original.
    scheduledTime: time ?? schedule.time,
    status: "pending" as const,
  } : null;

  // Auto-execute action when screen is opened via a notification quick-action button.
  // This runs silently (no alarm UI shown) and immediately navigates away.
  useEffect(() => {
    if (!action || !pendingDose) return;
    const run = async () => {
      if (action === "taken") {
        await markDose(pendingDose, "taken");
      } else if (action === "skipped") {
        await markDose(pendingDose, "skipped");
      } else if (action === "snooze") {
        await snoozeDose(pendingDose);
      }
      // On cold-start there is no history stack — use replace as a safe fallback.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    };
    run().catch(() => {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, pendingDose]);

  // Pulse animation
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  // If an action was provided the screen acts as an invisible handler — render nothing.
  if (!medication || !schedule || action) return null;

  const colors = getColorConfig(medication.color);

  const dose = {
    medication,
    schedule,
    scheduledDate: date,
    scheduledTime: time ?? schedule.time,
    status: "pending" as const,
  };

  const [y, mo, d] = date.split("-").map(Number);
  const dateObj = new Date(y, mo - 1, d, 12);
  const coDue = schedules
    .filter((s2) => s2.id !== schedule.id && s2.isActive && s2.time === schedule.time)
    .map((s2) => ({
      schedule: s2,
      medication: (allMeds ?? medications).find((m) => m.id === s2.medicationId),
    }))
    .filter((x): x is { schedule: typeof schedule; medication: Medication } =>
      !!x.medication && x.medication.isActive && isScheduleActiveOnDate(x.schedule, dateObj, x.medication)
    )
    .filter((x) => {
      const log = todayLogs.find(
        (l) => l.scheduleId === x.schedule.id && l.scheduledDate === date
      );
      return !log || log.status === "pending";
    });

  const handleCoDose = async (co: (typeof coDue)[number], status: "taken" | "skipped") => {
    setHandledCo((prev) => ({ ...prev, [co.schedule.id]: status }));
    // markDose cancels the queued alarm for that dose — no sequential ringing.
    await markDose(
      {
        medication: co.medication,
        schedule: co.schedule,
        scheduledDate: date,
        scheduledTime: co.schedule.time,
        status: "pending" as const,
      },
      status
    );
  };

  const handleTake = async () => {
    stopSpeaking();
    await stopAlarm();
    await markDose(dose, "taken", noteText.trim() || undefined);
    router.back();
  };

  const handleSkip = async () => {
    stopSpeaking();
    await stopAlarm();
    await markDose(dose, "skipped", noteText.trim() || undefined);
    router.back();
  };

  // User-configured default (Settings) — highlights the matching chip below and
  // is what the plain "Snooze" path uses.
  const defaultSnoozeMinutes = getDefaultSnoozeMinutes();

  const handleSnooze = async (minutes: number = defaultSnoozeMinutes) => {
    stopSpeaking();
    await stopAlarm();
    await snoozeDose(dose, minutes);
    router.back();
  };

  return (
    <SafeAreaView
      style={{ backgroundColor: colors.light }}
      className="flex-1 items-center justify-between px-6 py-8"
    >
      {/* Top: time. The background is the medication's fixed LIGHT tint, so use
          fixed dark text (colors.text) instead of theme tokens — otherwise the
          theme-aware text-text/text-muted turn near-white in dark mode and the
          most critical screen becomes unreadable (~1.1:1, audit H8). */}
      <View className="items-center">
        <Text className="text-6xl font-black" style={{ color: colors.text }}>{formatTimeForDisplay(time ?? schedule.time)}</Text>
        <Text className="text-base mt-1" style={{ color: colors.text, opacity: 0.7 }}>{t('alarm.subtitle', { name: medication.name })}</Text>
      </View>

      {/* Center: pill icon */}
      <View className="items-center">
        <Animated.View
          style={{ transform: [{ scale: pulse }] }}
        >
          <View
            style={{ backgroundColor: colors.bg }}
            className="w-32 h-32 rounded-full items-center justify-center shadow-lg"
          >
            <Ionicons name="medical" size={64} color="#fff" />
          </View>
        </Animated.View>

        <Text
          style={{ color: colors.text }}
          className="text-3xl font-black mt-6 text-center"
        >
          {medication.name}
        </Text>
        {/* Dosage pill */}
        <View
          style={{ backgroundColor: colors.bg + "22", borderColor: colors.bg + "55" }}
          className="mt-2 px-4 py-1 rounded-full border"
        >
          <Text style={{ color: colors.text }} className="text-sm font-semibold text-center">
            {getLocalizedDosage(medication, t)}
          </Text>
        </View>
        {medication.notes ? (
          <Text className="text-sm mt-2 text-center" style={{ color: colors.text, opacity: 0.7 }}>{medication.notes}</Text>
        ) : null}

        {/* Optional note input — hidden until the user taps the toggle. Fixed
            dark tint on the light alarm background, not theme muted (H8). */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={showNote ? t('common.cancel') : t('doseCard.addNote')}
          onPress={() => setShowNote((v) => !v)}
          className="mt-4 flex-row items-center justify-center gap-2 self-center py-3 px-5 min-h-[44px]"
        >
          <Ionicons
            name={showNote ? "chevron-up" : "create-outline"}
            size={20}
            color={colors.text}
          />
          <Text className="text-sm" style={{ color: colors.text, opacity: 0.7 }}>
            {showNote ? t('common.cancel') : t('doseCard.addNote')}
          </Text>
        </AppPressable>
        {showNote && (
          <TextInput
            value={noteText}
            onChangeText={setNoteText}
            placeholder={t('doseCard.noteModalPlaceholder')}
            placeholderTextColor={theme.muted}
            className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-3 text-text text-sm"
            multiline
            numberOfLines={2}
            maxLength={200}
            autoFocus
          />
        )}
      </View>

      {/* Group dose (F3): other meds due at this same time — confirming here
          cancels their queued alarms so they don't ring one after another. */}
      {coDue.length > 0 && (
        <View className="w-full mb-3">
          <Text className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: colors.text, opacity: 0.7 }}>
            {t("alarm.alsoDue", { count: coDue.length })}
          </Text>
          {coDue.map((co) => {
            const handled = handledCo[co.schedule.id];
            return (
              <View
                key={co.schedule.id}
                style={{ backgroundColor: colors.bg + "18", borderColor: colors.bg + "44" }}
                className="flex-row items-center gap-2 rounded-2xl border px-3 py-2 mb-2"
              >
                <Text className="flex-1 text-sm font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                  {co.medication.name} · {co.medication.dosage}
                </Text>
                {handled ? (
                  <Ionicons
                    name={handled === "taken" ? "checkmark-circle" : "close-circle"}
                    size={22}
                    color={colors.text}
                  />
                ) : (
                  <>
                    <AppPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t("alarm.takeMed")} ${co.medication.name}`}
                      onPress={() => handleCoDose(co, "taken")}
                      className="rounded-xl px-3 py-2 min-h-[40px] items-center justify-center"
                      style={{ backgroundColor: colors.bg }}
                    >
                      <Ionicons name="checkmark" size={18} color="#ffffff" />
                    </AppPressable>
                    <AppPressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t("alarm.skip")} ${co.medication.name}`}
                      onPress={() => handleCoDose(co, "skipped")}
                      className="rounded-xl px-3 py-2 min-h-[40px] items-center justify-center border"
                      style={{ borderColor: colors.bg + "66" }}
                    >
                      <Ionicons name="close" size={18} color={colors.text} />
                    </AppPressable>
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Actions */}
      <View className="w-full gap-3">
        {/* Take */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={t('alarm.takeMed')}
          onPress={handleTake}
          style={{
            backgroundColor: "#fff",
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            borderWidth: 3,
            borderColor: colors.bg,
          }}
          className="rounded-2xl py-4 items-center flex-row justify-center gap-3"
        >
          <Ionicons name="checkmark-circle" size={24} color={colors.bg} />
          <Text style={{ color: colors.bg }} className="text-lg font-black">{t('alarm.takeMed')}</Text>
        </AppPressable>

        {/* Snooze */}
        {!showSnoozeOptions ? (
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel={t('alarm.snooze')}
            onPress={() => setShowSnoozeOptions(true)}
            className="rounded-2xl py-4 items-center flex-row justify-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700"
          >
            <Ionicons name="alarm-outline" size={20} color={theme.amber} />
            <Text className="text-amber-700 dark:text-amber-400 text-base font-bold">
              {t('alarm.snooze')}
            </Text>
          </AppPressable>
        ) : (
          <View className="rounded-2xl py-4 px-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700">
            <Text className="text-amber-700 dark:text-amber-400 text-sm font-bold text-center mb-3">
              {t('alarm.snoozePickerTitle')}
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2.5">
              {SNOOZE_OPTIONS.map((min) => {
                const isDefault = min === defaultSnoozeMinutes;
                return (
                  <AppPressable
                    key={min}
                    accessibilityRole="button"
                    accessibilityLabel={t('alarm.snoozeOption', { minutes: min })}
                    onPress={() => handleSnooze(min)}
                    style={{ width: 72 }}
                    className={`rounded-xl py-3.5 items-center ${
                      isDefault
                        ? 'bg-amber-500 dark:bg-amber-600 border-2 border-amber-600 dark:border-amber-500'
                        : 'bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700'
                    }`}
                  >
                    <Text className={`font-bold text-base ${
                      isDefault ? 'text-white' : 'text-amber-700 dark:text-amber-300'
                    }`}>
                      {min}
                    </Text>
                    <Text className={`text-[10px] ${
                      isDefault ? 'text-amber-100' : 'text-amber-500 dark:text-amber-400'
                    }`}>
                      min
                    </Text>
                  </AppPressable>
                );
              })}
            </View>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={() => setShowSnoozeOptions(false)}
              className="mt-3 items-center py-2"
            >
              <Text className="text-amber-600 dark:text-amber-400 text-sm font-medium">
                {t('common.cancel')}
              </Text>
            </AppPressable>
          </View>
        )}

        {/* Skip */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={t('alarm.skip')}
          onPress={handleSkip}
          className="rounded-2xl py-4 items-center flex-row justify-center gap-2"
        >
          <Ionicons name="close-outline" size={18} color={theme.muted} />
          <Text className="text-muted text-sm font-medium">{t('alarm.skip')}</Text>
        </AppPressable>
      </View>
    </SafeAreaView>
  );
}
