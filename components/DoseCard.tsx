import { View, Text, TouchableOpacity, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { TodayDose } from "../src/types";
import { CATEGORY_CONFIG, getCategoryLabel, getColorConfig } from "../src/utils";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface DoseCardProps {
  dose: TodayDose;
  onTake: () => void;
  onSkip: () => void;
  onSnooze: () => void;
  /** Optional — when provided, an undo button is shown on taken/skipped cards */
  onRevert?: () => void;
  /** Optional — when provided, the time badge is tappable to pick a custom time */
  onReschedule?: () => void;
  /** Optional — when provided, a note chip is shown and tapping it saves the note */
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
  const statusTheme = theme.doseStatus[dose.status];
  const isPending = dose.status === "pending";
  const isMissed  = dose.status === "missed";
  const isSnoozed = !!dose.snoozedUntil;
  const displayTime = dose.snoozedUntil ?? dose.scheduledTime;

  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState(dose.notes ?? "");

  return (
  <>
    <View
      style={{ backgroundColor: statusTheme.bg, borderColor: statusTheme.border }}
      className="rounded-2xl border p-4 mb-3 shadow-sm"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          {/* Pill color dot */}
          <View
            style={{ backgroundColor: colors.bg }}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <Ionicons name="medical" size={20} color="#fff" />
          </View>
          <View>
            <Text className="text-base font-bold text-text">{dose.medication.name}</Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Text className="text-sm text-muted">{dose.medication.dosage}</Text>
              <Text className="text-slate-300 dark:text-slate-600">·</Text>
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

        {/* Time badge — tappable when pending + onReschedule provided */}
        <TouchableOpacity
          activeOpacity={isPending && onReschedule ? 0.6 : 1}
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
        </TouchableOpacity>
      </View>

      {/* Notes */}
      {dose.medication.notes ? (
        <Text className="text-sm text-muted mb-2 ml-12">{dose.medication.notes}</Text>
      ) : null}

      {/* Status or Actions — minHeight keeps the card from collapsing when switching between
          the tall 'pending' button row and the compact 'taken/skipped' status line. */}
      <View style={{ minHeight: 40 }}>
      {(!isPending && !isMissed) ? (
        <View className="flex-row items-center justify-between ml-12 gap-2">
          <View className="flex-row items-center gap-2 flex-1">
            <Ionicons
              name={STATUS_ICONS[dose.status]}
              size={16}
              color={dose.status === "taken" ? "#22c55e" : "#ef4444"}
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
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRevert(); }}
              className="flex-row items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5"
            >
              <Ionicons name="arrow-undo-outline" size={13} color="#64748b" />
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">
                {t('doseCard.revert')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : isPending ? (
        <>
          <View className="flex-row gap-2 mt-2">
            {/* Snooze */}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSnooze(); }}
              className="flex-row items-center gap-1 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2"
            >
              <Ionicons name="alarm-outline" size={15} color="#d97706" />
              <Text className="text-amber-700 dark:text-amber-400 text-xs font-semibold">{t('doseCard.snooze')}</Text>
            </TouchableOpacity>

            {/* Skip */}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }}
              className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2"
            >
              <Ionicons name="close-outline" size={15} color="#ef4444" />
              <Text className="text-red-500 dark:text-red-400 text-xs font-semibold">{t('doseCard.skip')}</Text>
            </TouchableOpacity>

            {/* Take */}
            <TouchableOpacity
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onTake(); }}
              className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm font-bold">{t('doseCard.take')}</Text>
            </TouchableOpacity>
          </View>

          {/* Undo snooze — shown below the action row when the dose is snoozed */}
          {isSnoozed && onRevert && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRevert(); }}
              className="flex-row items-center gap-1 mt-2 ml-12"
            >
              <Ionicons name="arrow-undo-outline" size={13} color="#94a3b8" />
              <Text className="text-xs text-muted">{t('doseCard.revertSnooze')}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        /* Missed: allow recording a late dose, but no snooze */
        <View className="flex-row gap-2 mt-2 items-center">
          <View className="flex-row items-center gap-1.5 mr-1">
            <Ionicons name={STATUS_ICONS[dose.status]} size={14} color="#94a3b8" />
            <Text className="text-xs text-muted font-semibold">{t(`status.${dose.status}`)}</Text>
          </View>

          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }}
            className="flex-row items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
          >
            <Ionicons name="close-outline" size={15} color="#64748b" />
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{t('doseCard.skip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onTake(); }}
            className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text className="text-white text-sm font-bold">{t('doseCard.takeLate')}</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>

      {/* Note chip (taken/skipped only) */}
      {!isPending && !isMissed && onUpdateNote && (
        <TouchableOpacity
          onPress={() => { setNoteDraft(dose.notes ?? ""); setNoteModalVisible(true); }}
          className="flex-row items-center gap-1.5 mt-2 ml-12"
        >
          <Ionicons name={dose.notes ? "chatbubble-outline" : "add-circle-outline"} size={13} color="#94a3b8" />
          <Text className="text-xs text-muted">
            {dose.notes ? dose.notes : t('doseCard.addNote')}
          </Text>
        </TouchableOpacity>
      )}
    </View>

    {/* Note editing modal */}
    <Modal
      visible={noteModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setNoteModalVisible(false)}
    >
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-8">
          <Text className="text-base font-bold text-text mb-3">{t('doseCard.noteModalTitle')}</Text>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder={t('doseCard.noteModalPlaceholder')}
            placeholderTextColor="#94a3b8"
            className="border border-border rounded-2xl px-4 py-3 text-text text-sm bg-slate-50 dark:bg-slate-800 mb-4"
            multiline
            numberOfLines={3}
            maxLength={200}
            autoFocus
          />
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setNoteModalVisible(false)}
              className="flex-1 rounded-2xl py-3 items-center bg-slate-100 dark:bg-slate-800"
            >
              <Text className="text-muted font-semibold">{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onUpdateNote?.(noteDraft.trim());
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setNoteModalVisible(false);
              }}
              className="flex-1 rounded-2xl py-3 items-center bg-primary"
            >
              <Text className="text-white font-bold">{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>
  );
}
