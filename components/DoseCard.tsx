import { View, Text, Modal, TextInput, Image, PanResponder, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useRef } from "react";
import { TodayDose, SkipReason } from "../src/types";
import { CATEGORY_CONFIG, getCategoryLabel, getColorConfig } from "../src/utils";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { AppPressable } from "./AppPressable";

interface DoseCardProps {
  dose: TodayDose;
  onTake: () => void;
  onSkip: (reason?: SkipReason) => void;
  onSnooze: () => void;
  /** Optional â€” when provided, an undo button is shown on taken/skipped cards */
  onRevert?: () => void;
  /** Optional â€” when provided, the time badge is tappable to pick a custom time */
  onReschedule?: () => void;
  /** Optional â€” when provided, a note chip is shown and tapping it saves the note */
  onUpdateNote?: (note: string) => void;
}

const STATUS_ICONS = {
  pending: "time-outline" as const,
  taken:   "checkmark-circle" as const,
  skipped: "close-circle" as const,
  missed:  "alert-circle-outline" as const,
};

export function DoseCard({ dose, onTake, onSkip, onSnooze, onRevert, onReschedule, onUpdateNote }: DoseCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const colors = getColorConfig(dose.medication.color);
  const statusTheme = theme.doseStatus[dose.status === "missed" ? "missed" : dose.status];
  const isPending = dose.status === "pending";
  const isMissed  = dose.status === "missed";
  const isSnoozed = !!dose.snoozedUntil;
  const displayTime = dose.snoozedUntil ?? dose.scheduledTime;

  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState(dose.notes ?? "");
  const [skipReasonVisible, setSkipReasonVisible] = useState(false);

  const notePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) setNoteModalVisible(false); },
    })
  ).current;

  const skipPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) setSkipReasonVisible(false); },
    })
  ).current;

  // Reanimated: flash + ring burst on take button
  const takeScale   = useSharedValue(1);
  const ringScale   = useSharedValue(0.4);
  const ringOpacity = useSharedValue(0);

  const takeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: takeScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  function handleTakePress() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Action fires immediately â€” animation is purely cosmetic
    onTake();
    // Quick scale flash
    takeScale.value = withSequence(
      withTiming(1.06, { duration: 70 }),
      withTiming(1,    { duration: 110 })
    );
    // Expanding ring (destello)
    ringScale.value   = 0.4;
    ringOpacity.value = 0.7;
    ringScale.value   = withTiming(2.0, { duration: 380 });
    ringOpacity.value = withTiming(0,   { duration: 380 });
  }

  const SKIP_REASONS: { key: SkipReason; icon: string; color: string }[] = [
    { key: "forgot",      icon: "help-circle-outline",  color: theme.warning },
    { key: "side_effect", icon: "alert-circle-outline",  color: theme.danger },
    { key: "no_stock",    icon: "cube-outline",          color: theme.accent },
    { key: "other",       icon: "ellipsis-horizontal",   color: theme.muted },
  ];

  return (
  <>
    <View
      style={{ backgroundColor: statusTheme.bg, borderColor: statusTheme.border }}
      className="rounded-2xl border p-4 mb-3 shadow-sm"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          {/* Pill icon or photo */}
          {dose.medication.photoUri ? (
            <Image
              source={{ uri: dose.medication.photoUri }}
              className="w-10 h-10 rounded-full"
              resizeMode="cover"
            />
          ) : (
            <View
              style={{ backgroundColor: colors.bg }}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <Ionicons name="medical" size={20} color="#fff" />
            </View>
          )}
          <View>
            <Text className="text-base font-bold text-text">{dose.medication.name}</Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Text className="text-sm text-muted">{dose.medication.dosage}</Text>
              <Text className="text-muted">Â·</Text>
              <Ionicons
                name={CATEGORY_CONFIG[dose.medication.category].icon as any}
                size={11}
                color={CATEGORY_CONFIG[dose.medication.category].tint}
              />
              <Text
                style={{ color: CATEGORY_CONFIG[dose.medication.category].tint }}
                className="text-xs font-semibold"
              >
                {getCategoryLabel(dose.medication.category, t)}
              </Text>
            </View>
          </View>
        </View>

        {/* Time badge â€” tappable when pending + onReschedule provided */}
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={displayTime}
          accessibilityHint={isPending && onReschedule ? t('doseCard.rescheduleTitle') : undefined}
          
          onPress={() => {
            if (isPending && onReschedule) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onReschedule();
            }
          }}
          style={{
            backgroundColor: isSnoozed
              ? (theme.isDark ? "#451a03" : "#fef3c7")
              : colors.light,
            borderColor: isSnoozed
              ? (theme.isDark ? "#92400e" : "#fcd34d")
              : colors.border,
          }}
          className="rounded-xl px-3 py-1 border flex-row items-center gap-1"
        >
          {isSnoozed && (
            <Ionicons name="alarm-outline" size={11} color="#d97706" />
          )}
          <Text
            style={{ color: isSnoozed
              ? (theme.isDark ? "#fbbf24" : "#92400e")
              : colors.text }}
            className="text-sm font-bold"
          >
            {displayTime}
          </Text>
          {isPending && onReschedule && (
            <Ionicons
              name="pencil-outline"
              size={10}
              color={isSnoozed
                ? (theme.isDark ? "#fbbf24" : "#92400e")
                : colors.text}
              style={{ opacity: 0.6 }}
            />
          )}
        </AppPressable>
      </View>

      {/* Notes */}
      {dose.medication.notes ? (
        <Text className="text-sm text-muted mb-2 ml-12">{dose.medication.notes}</Text>
      ) : null}

      {/* Status or Actions â€” minHeight keeps the card from collapsing when switching between
          the tall 'pending' button row and the compact 'taken/skipped' status line. */}
      <View style={{ minHeight: 40 }}>
      {(!isPending && !isMissed) ? (
        <View className="flex-row items-center justify-between ml-12 gap-2">
          <View className="flex-row items-center gap-2 flex-1">
            <Ionicons
              name={STATUS_ICONS[dose.status]}
              size={16}
              color={dose.status === "taken" ? theme.success : theme.danger}
            />
            <Text
              style={{ color: dose.status === "taken"
                ? (theme.isDark ? "#4ade80" : "#15803d")
                : (theme.isDark ? "#f87171" : "#b91c1c") }}
              className="text-sm font-semibold"
            >
              {t(`status.${dose.status}`)}
              {dose.takenAt
                ? t('doseCard.takenAt', { time: new Date(dose.takenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
                : ""}
            </Text>
          </View>
          {onRevert && (
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('doseCard.revert')}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRevert(); }}
              className="flex-row items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5"
            >
              <Ionicons name="arrow-undo-outline" size={13} color={theme.muted} />
              <Text className="text-muted text-xs font-semibold">
                {t('doseCard.revert')}
              </Text>
            </AppPressable>
          )}
        </View>
      ) : isPending ? (
        <>
          <View className="flex-row gap-2 mt-2">
            {/* Snooze */}
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('doseCard.snooze')}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSnooze(); }}
              className="flex-row items-center gap-1 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2"
            >
              <Ionicons name="alarm-outline" size={15} color="#d97706" />
              <Text className="text-amber-700 dark:text-amber-400 text-xs font-semibold">{t('doseCard.snooze')}</Text>
            </AppPressable>

            {/* Skip */}
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('doseCard.skip')}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSkipReasonVisible(true); }}
              className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2"
            >
              <Ionicons name="close-outline" size={15} color="#ef4444" />
              <Text className="text-red-500 dark:text-red-400 text-xs font-semibold">{t('doseCard.skip')}</Text>
            </AppPressable>

            {/* Take */}
            <Animated.View style={[{ flex: 1 }, takeAnimStyle]}>
              <AppPressable
                accessibilityRole="button"
                accessibilityLabel={t('doseCard.take')}
                onPress={handleTakePress}
                className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text className="text-white text-sm font-bold">{t('doseCard.take')}</Text>
              </AppPressable>
              {/* Destello ring â€” expands and fades on tap */}
              <Animated.View
                style={[
                  ringStyle,
                  {
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: 12,
                    borderWidth: 2.5,
                    borderColor: '#22c55e',
                    backgroundColor: 'transparent',
                    pointerEvents: 'none',
                  } as any,
                ]}
              />
            </Animated.View>
          </View>

          {/* Undo snooze â€” shown below the action row when the dose is snoozed */}
          {isSnoozed && onRevert && (
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('doseCard.revertSnooze')}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRevert(); }}
              className="flex-row items-center gap-1 mt-2 ml-12"
            >
              <Ionicons name="arrow-undo-outline" size={13} color={theme.muted} />
              <Text className="text-xs text-muted">{t('doseCard.revertSnooze')}</Text>
            </AppPressable>
          )}
        </>
      ) : (
        /* Missed: allow recording a late dose, but no snooze */
        <View className="flex-row gap-2 mt-2 items-center">
          <View className="flex-row items-center gap-1.5 mr-1">
            <Ionicons name={STATUS_ICONS[dose.status]} size={14} color={theme.muted} />
            <Text className="text-xs text-muted font-semibold">{t(`status.${dose.status}`)}</Text>
          </View>

          <AppPressable
            accessibilityRole="button"
            accessibilityLabel={t('doseCard.skip')}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSkipReasonVisible(true); }}
            className="flex-row items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          >
            <Ionicons name="close-outline" size={15} color={theme.muted} />
            <Text className="text-muted text-xs font-semibold">{t('doseCard.skip')}</Text>
          </AppPressable>

          <Animated.View style={[{ flex: 1 }, takeAnimStyle]}>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('doseCard.takeLate')}
              onPress={handleTakePress}
              className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm font-bold">{t('doseCard.takeLate')}</Text>
            </AppPressable>
          </Animated.View>
        </View>
      )}
      </View>

      {/* Note chip (taken/skipped only) */}
      {!isPending && !isMissed && onUpdateNote && (
        <AppPressable
          accessibilityRole="button"
          accessibilityLabel={t('doseCard.addNote')}
          onPress={() => { setNoteDraft(dose.notes ?? ""); setNoteModalVisible(true); }}
          className="flex-row items-center gap-1.5 mt-2 ml-12"
        >
          <Ionicons name={dose.notes ? "chatbubble-outline" : "add-circle-outline"} size={13} color={theme.muted} />
          <Text className="text-xs text-muted">
            {dose.notes ? dose.notes : t('doseCard.addNote')}
          </Text>
        </AppPressable>
      )}

      {/* Skip reason chip (skipped only) */}
      {dose.status === "skipped" && dose.skipReason && (
        <View className="flex-row items-center gap-1.5 mt-1 ml-12">
          <Ionicons name="information-circle-outline" size={13} color={theme.muted} />
          <Text className="text-xs text-muted">{t(`doseCard.skipReason_${dose.skipReason}`)}</Text>
        </View>
      )}
    </View>

    {/* Note editing modal */}
    <Modal
      visible={noteModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setNoteModalVisible(false)}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setNoteModalVisible(false)}>
        <Pressable onPress={() => {}} className="bg-card rounded-t-3xl">
          <View className="items-center pt-3 pb-1" {...notePan.panHandlers}>
            <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
          </View>
          <View className="px-5 pb-8 pt-2">
          <Text className="text-base font-bold text-text mb-3">{t('doseCard.noteModalTitle')}</Text>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder={t('doseCard.noteModalPlaceholder')}
            placeholderTextcolor={theme.muted}
            className="border border-border rounded-2xl px-4 py-3 text-text text-sm bg-slate-50 dark:bg-slate-800 mb-4"
            multiline
            numberOfLines={3}
            maxLength={200}
            autoFocus
          />
          <View className="flex-row gap-3">
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={() => setNoteModalVisible(false)}
              className="flex-1 rounded-2xl py-3 items-center bg-slate-100 dark:bg-slate-800"
            >
              <Text className="text-muted font-semibold">{t('common.cancel')}</Text>
            </AppPressable>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
              onPress={() => {
                onUpdateNote?.(noteDraft.trim());
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setNoteModalVisible(false);
              }}
              className="flex-1 rounded-2xl py-3 items-center bg-primary"
            >
              <Text className="text-white font-bold">{t('common.save')}</Text>
            </AppPressable>
          </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Skip reason modal */}
    <Modal
      visible={skipReasonVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setSkipReasonVisible(false)}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setSkipReasonVisible(false)}>
        <Pressable onPress={() => {}} className="bg-card rounded-t-3xl">
          <View className="items-center pt-3 pb-1" {...skipPan.panHandlers}>
            <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
          </View>
          <View className="px-5 pb-8 pt-2">
          <Text className="text-base font-bold text-text mb-1">{t('doseCard.skipReasonTitle')}</Text>
          <Text className="text-xs text-muted mb-4">{t('doseCard.skipReasonSubtitle')}</Text>
          {SKIP_REASONS.map(({ key, icon, color }) => (
            <AppPressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={t(`doseCard.skipReason_${key}`)}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSkipReasonVisible(false);
                onSkip(key);
              }}
              className="flex-row items-center gap-3 py-3.5 border-b border-border"
            >
              <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: color + "18" }}>
                <Ionicons name={icon as any} size={18} color={color} />
              </View>
              <Text className="text-sm font-semibold text-text flex-1">{t(`doseCard.skipReason_${key}`)}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.muted} />
            </AppPressable>
          ))}
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={() => { setSkipReasonVisible(false); onSkip(undefined); }}
            className="mt-4 items-center py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl"
          >
            <Text className="text-muted font-semibold text-sm">{t('common.cancel')}</Text>
          </AppPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  </>
  );
}
