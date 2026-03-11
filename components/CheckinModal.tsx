import {
  Modal, View, Text, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, PanResponder, Pressable,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "../src/i18n";
import { useAppStore } from "../src/store";
import { DailyCheckin } from "../src/types";
import { today } from "../src/utils";

// ─── Symptom keys ──────────────────────────────────────────────────────────

const ALL_SYMPTOMS = [
  "headache", "nausea", "fatigue", "dizziness",
  "stomach", "pain", "anxiety", "insomnia",
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

export function CheckinModal({ visible, onClose, existing }: CheckinModalProps) {
  const { t } = useTranslation();
  const saveDailyCheckin = useAppStore((s) => s.saveDailyCheckin);
  const { showToast } = require("../src/context/ToastContext").useToast();

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate form when editing an existing check-in
  useEffect(() => {
    if (visible) {
      setMood(existing?.mood ?? 3);
      setSymptoms(existing?.symptoms ?? []);
      setNotes(existing?.notes ?? "");
    }
  }, [visible, existing]);

  const toggleSymptom = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSymptoms((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDailyCheckin({
        date: existing?.date ?? today(),
        mood,
        symptoms,
        notes: notes.trim() || undefined,
      });
      showToast(t("checkin.successMsg"), "success");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const dismissPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) onClose(); },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
          <Pressable onPress={() => {}} className="bg-background rounded-t-3xl max-h-[90%]">
            {/* Handle */}
            <View className="items-center pt-3 pb-1" {...dismissPan.panHandlers}>
              <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </View>

            <ScrollView
              className="px-5"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text className="text-lg font-black text-text mt-3 mb-1">
                {t("checkin.title")}
              </Text>
              <Text className="text-sm text-muted mb-5">{t("checkin.heading")}</Text>

              {/* Mood selector */}
              <Text className="text-sm font-semibold text-text mb-3">{t("checkin.moodLabel")}</Text>
              <View className="flex-row justify-between mb-6">
                {MOODS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMood(m); }}
                    className={`flex-1 mx-1 items-center py-3 rounded-2xl border-2 ${
                      mood === m
                        ? "bg-primary/10 border-primary"
                        : "bg-card border-border"
                    }`}
                  >
                    <Text className="text-2xl">{t(`checkin.moodEmoji_${m}`)}</Text>
                    <Text className={`text-[10px] mt-1 font-semibold ${mood === m ? "text-primary" : "text-muted"}`}>
                      {t(`checkin.mood_${m}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Symptoms */}
              <Text className="text-sm font-semibold text-text mb-3">{t("checkin.symptomsLabel")}</Text>
              <View className="flex-row flex-wrap gap-2 mb-6">
                {ALL_SYMPTOMS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => toggleSymptom(s)}
                    className={`rounded-full px-4 py-2 border ${
                      symptoms.includes(s)
                        ? "bg-danger/10 border-danger"
                        : "bg-card border-border"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        symptoms.includes(s) ? "text-danger" : "text-muted"
                      }`}
                    >
                      {t(`checkin.symptom_${s}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notes */}
              <Text className="text-sm font-semibold text-text mb-1.5">{t("checkin.fieldNotes")}</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t("checkin.fieldNotesPlaceholder")}
                placeholderTextColor="#94a3b8"
                className="border border-border rounded-2xl px-4 py-3 text-text text-sm bg-card mb-5"
                multiline
                numberOfLines={3}
              />

              {/* Actions */}
              <View className="flex-row gap-3 mb-8">
                <TouchableOpacity
                  onPress={onClose}
                  className="flex-1 py-3.5 border border-border rounded-2xl items-center"
                >
                  <Text className="font-semibold text-muted">{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave(); }}
                  disabled={saving}
                  className={`flex-1 flex-2 py-3.5 rounded-2xl items-center ${saving ? "bg-slate-300" : "bg-primary"}`}
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
