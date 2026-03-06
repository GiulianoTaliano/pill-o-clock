import { View, Text, TouchableOpacity, Animated, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../src/store";
import { getColorConfig } from "../src/utils";
import { SNOOZE_MINUTES } from "../src/services/notifications";
import { useTranslation } from "../src/i18n";
import { stopAlarm, setAlarmWindowFlags, clearAlarmWindowFlags } from "expo-alarm";

/**
 * Fullscreen alarm screen.
 * Opened via deep link: pilloclock://alarm?scheduleId=...&date=...
 *
 * When an `action` query param is present (sent by notification quick-action
 * buttons), the screen silently executes the action and navigates back
 * without rendering any UI.
 */
export default function AlarmScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { scheduleId, date, action } = useLocalSearchParams<{
    scheduleId: string;
    date: string;
    /** Set by AlarmActionReceiver: "taken" | "snooze" | "skipped" */
    action?: string;
  }>();

  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const markDose = useAppStore((s) => s.markDose);
  const snoozeDose = useAppStore((s) => s.snoozeDose);
  const [noteText, setNoteText] = useState("");

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

  // Navigate back if data is unavailable — must be inside useEffect, never during render.
  useEffect(() => {
    if (!medication || !schedule) {
      stopAlarm().catch(() => {});
      router.back();
    }
  }, [medication, schedule, router]);

  const pendingDose = schedule && medication ? {
    medication,
    schedule,
    scheduledDate: date,
    scheduledTime: schedule.time,
    status: "pending" as const,
  } : null;

  // Auto-execute action when screen is opened via a notification quick-action button.
  // This runs silently (no alarm UI shown) and immediately pops back.
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
      router.back();
    };
    run().catch(() => router.back());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

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
    scheduledTime: schedule.time,
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
        <Text className="text-6xl font-black text-text">{schedule.time}</Text>
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
        <Text className="text-lg text-text mt-1">{medication.dosage}</Text>
        {medication.notes ? (
          <Text className="text-sm text-muted mt-1 text-center">{medication.notes}</Text>
        ) : null}

        {/* Optional note input */}
        <TextInput
          value={noteText}
          onChangeText={setNoteText}
          placeholder={t('doseCard.noteModalPlaceholder')}
          placeholderTextColor="rgba(100,116,139,0.7)"
          className="mt-4 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 px-4 py-3 text-text text-sm"
          multiline
          numberOfLines={2}
          maxLength={200}
        />
      </View>

      {/* Actions */}
      <View className="w-full gap-3">
        {/* Take */}
        <TouchableOpacity
          onPress={handleTake}
          style={{ backgroundColor: colors.bg }}
          className="rounded-2xl py-4 items-center flex-row justify-center gap-3 shadow"
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text className="text-white text-lg font-black">{t('alarm.takeMed')}</Text>
        </TouchableOpacity>

        {/* Snooze */}
        <TouchableOpacity
          onPress={handleSnooze}
          className="rounded-2xl py-3 items-center flex-row justify-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700"
        >
          <Ionicons name="alarm-outline" size={20} color="#d97706" />
          <Text className="text-amber-700 text-base font-bold">
            {t('alarm.snooze', { minutes: SNOOZE_MINUTES })}
          </Text>
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity
          onPress={handleSkip}
          className="rounded-2xl py-3 items-center flex-row justify-center gap-2"
        >
          <Ionicons name="close-outline" size={18} color="#94a3b8" />
          <Text className="text-muted text-sm font-medium">{t('alarm.skip')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
