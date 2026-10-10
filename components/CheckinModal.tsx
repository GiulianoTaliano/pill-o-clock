import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useState, useEffect, useRef } from "react";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { useAppStore } from "../src/store";
import { DailyCheckin } from "../src/types";
import { today } from "../src/utils";
import { format } from "date-fns";
import { useToast } from "../src/context/ToastContext";

// ─── Symptom keys ──────────────────────────────────────────────────────────

const ALL_SYMPTOMS = [
  "headache",
  "nausea",
  "fatigue",
  "dizziness",
  "stomach",
  "pain",
  "anxiety",
  "insomnia",
];

// ─── Mood options ──────────────────────────────────────────────────────────

const MOODS = [1, 2, 3, 4, 5] as const;

// ─── Props ─────────────────────────────────────────────────────────────────

interface CheckinModalProps {
  visible: boolean;
  onClose: () => void;
  /** If provided, pre-fills the form for editing */
  existing?: DailyCheckin;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function CheckinModal({
  visible,
  onClose,
  existing,
}: CheckinModalProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const saveDailyCheckin = useAppStore((s) => s.saveDailyCheckin);
  const { showToast } = useToast();

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveGuard = useRef(false);
  const baseline = useRef("");

  // Populate form when editing an existing check-in
  useEffect(() => {
    if (visible) {
      setMood(existing?.mood ?? 3);
      setSymptoms(existing?.symptoms ?? []);
      setNotes(existing?.notes ?? "");
      setError(null);
      baseline.current = JSON.stringify([
        existing?.mood ?? 3,
        existing?.symptoms ?? [],
        existing?.notes ?? "",
      ]);
    }
  }, [visible, existing]);

  const toggleSymptom = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSymptoms((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    if (saveGuard.current) return;
    saveGuard.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveDailyCheckin({
        date: existing?.date ?? today(),
        mood,
        symptoms,
        notes: notes.trim() || undefined,
      });
      showToast(t("checkin.successMsg"), "success");
      onClose();
    } catch {
      setError(t("uxHealth.saveError"));
    } finally {
      saveGuard.current = false;
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (saving) return;
    if (JSON.stringify([mood, symptoms, notes]) === baseline.current) {
      onClose();
      return;
    }
    Alert.alert(t("uxHealth.discardTitle"), t("uxHealth.discardBody"), [
      { text: t("uxHealth.keepEditing"), style: "cancel" },
      { text: t("uxHealth.discard"), style: "destructive", onPress: onClose },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={requestClose}
        >
          <Pressable
            accessibilityViewIsModal
            onPress={() => {}}
            className="bg-background rounded-t-3xl max-h-[90%]"
          >
            {/* Handle */}
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </View>

            <ScrollView
              className="px-5"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text className="text-lg font-black text-text mt-3 mb-1">
                {t("uxHealth.editDate", {
                  date: format(
                    new Date((existing?.date ?? today()) + "T12:00"),
                    "PPP",
                    { locale: getDateLocale() }
                  ),
                })}
              </Text>
              <Text className="text-sm text-muted mb-5">
                {t("checkin.moodLabel")}
              </Text>

              {/* Mood selector */}
              <Text className="text-sm font-semibold text-text mb-3">
                {t("checkin.moodLabel")}
              </Text>
              <View className="flex-row justify-between mb-6">
                {MOODS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`checkin.mood_${m}`)}
                    accessibilityState={{ checked: mood === m }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMood(m);
                    }}
                    className={`flex-1 mx-1 items-center py-3 rounded-2xl border-2 ${
                      mood === m
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border"
                    }`}
                  >
                    <Text className="text-2xl">
                      {t(`checkin.moodEmoji_${m}`)}
                    </Text>
                    <Text
                      className={`text-xs mt-1 text-center font-semibold ${
                        mood === m ? "text-primary" : "text-muted"
                      }`}
                    >
                      {t(`checkin.mood_${m}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Symptoms */}
              <Text className="text-sm font-semibold text-text mb-3">
                {t("checkin.symptomsLabel")}
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-6">
                {ALL_SYMPTOMS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: symptoms.includes(s) }}
                    onPress={() => toggleSymptom(s)}
                    className={`min-h-[48px] justify-center rounded-full px-4 py-2 border ${
                      symptoms.includes(s)
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        symptoms.includes(s) ? "text-primary" : "text-muted"
                      }`}
                    >
                      {t(`checkin.symptom_${s}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: symptoms.length === 0 }}
                  onPress={() => setSymptoms([])}
                  className="min-h-[48px] justify-center rounded-full px-4 py-2 border border-border bg-card"
                >
                  <Text className="text-sm text-muted">
                    {t("uxHealth.noSymptoms")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <Text className="text-sm font-semibold text-text mb-1.5">
                {t("checkin.fieldNotes")}
              </Text>
              <TextInput
                accessibilityLabel={t("checkin.fieldNotes")}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("checkin.fieldNotesPlaceholder")}
                placeholderTextColor={theme.muted}
                className="border border-border rounded-2xl px-4 py-3 text-text text-sm bg-card mb-5"
                multiline
                numberOfLines={3}
              />

              {error && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  className="text-danger text-sm mb-4"
                >
                  {error}
                </Text>
              )}
              {/* Actions */}
              <View
                className="flex-row gap-3"
                style={{ marginBottom: Math.max(insets.bottom, 16) + 12 }}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={requestClose}
                  className="flex-1 py-3.5 border border-border rounded-2xl items-center"
                >
                  <Text className="font-semibold text-muted">
                    {t("common.cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ busy: saving, disabled: saving }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    handleSave();
                  }}
                  disabled={saving}
                  className={`flex-1 py-3.5 min-h-[48px] rounded-2xl items-center ${
                    saving ? "bg-slate-500" : "bg-action"
                  }`}
                >
                  <Text className="font-bold text-white">
                    {saving ? t("common.saving") : t("checkin.saveButton")}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
