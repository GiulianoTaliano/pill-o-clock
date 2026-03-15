import { View, Text, Animated, TextInput, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../src/store";
import { getColorConfig } from "../src/utils";
import { SNOOZE_MINUTES } from "../src/services/notifications";
import { useTranslation } from "../src/i18n";
import { stopAlarm, setAlarmWindowFlags, clearAlarmWindowFlags } from "expo-alarm";
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

  const schedule = schedules.find((s) => s.id === scheduleId);
  const medication = schedule ? medications.find((m) => m.id === schedule.medicationId) : null;

  // Set lock-screen / wake-up window flags so the activity shows above the
  // lock screen exactly like a regular alarm clock.  Clear them on unmount
  // so they don't bleed into other app screens.
  useEffect(() => {
    setAlarmWindowFlags().catch(() => {});
    return () => {
      clearAlarmWindowFlags().catch(() => {});
    };
  }, []);

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
    if (isLoading) return;          // store not ready yet, don't bail
    if (!medication || !schedule) {
      stopAlarm().catch(() => {});
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
  }, [isLoading, medication, schedule, router]);

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

  const handleTake = async () => {
    await stopAlarm();
    await markDose(dose, "taken", noteText.trim() || undefined);
    router.back();
  };

  const handleSkip = async () => {
    await stopAlarm();
    await markDose(dose, "skipped", noteText.trim() || undefined);
    router.back();
  };

  const handleSnooze = async () => {
    await stopAlarm();
    await snoozeDose(dose);
    router.back();
  };

  return (
    <SafeAreaView
      style={{ backgroundColor: colors.light }}
      className="flex-1 items-center justify-between px-6 py-8"
    >
      {/* Top: time */}
      <View className="items-center">
        <Text className="text-6xl font-black text-text">{time ?? schedule.time}</Text>
        <Text className="text-base text-muted mt-1">{t('alarm.subtitle')}</Text>
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
            {medication.dosage}
          </Text>
        </View>
        {medication.notes ? (
          <Text className="text-sm text-muted mt-2 text-center">{medication.notes}</Text>
        ) : null}

        {/* Optional note input — hidden until the user taps the toggle */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={showNote ? t('common.cancel') : t('doseCard.addNote')}
          onPress={() => setShowNote((v) => !v)}
          className="mt-4 flex-row items-center gap-1 self-center py-2 px-3"
        >
          <Ionicons
            name={showNote ? "chevron-up" : "create-outline"}
            size={16}
            color={theme.muted}
          />
          <Text className="text-xs text-muted">
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

      {/* Actions */}
      <View className="w-full gap-3">
        {/* Take */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={t('alarm.takeMed')}
          onPress={handleTake}
          style={{ backgroundColor: colors.bg }}
          className="rounded-2xl py-4 items-center flex-row justify-center gap-3 shadow"
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text className="text-white text-lg font-black">{t('alarm.takeMed')}</Text>
        </AppPressable>

        {/* Snooze */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={t('alarm.snooze', { minutes: SNOOZE_MINUTES })}
          onPress={handleSnooze}
          className="rounded-2xl py-4 items-center flex-row justify-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700"
        >
          <Ionicons name="alarm-outline" size={20} color={theme.amber} />
          <Text className="text-amber-700 dark:text-amber-400 text-base font-bold">
            {t('alarm.snooze', { minutes: SNOOZE_MINUTES })}
          </Text>
        </AppPressable>

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
