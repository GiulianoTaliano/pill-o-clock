import { useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { TodayDose, SkipReason } from "../src/types";
import { useAppStore } from "../src/store";
import {
  getColorConfig,
  formatTimeForDisplay,
  getLocalizedDosage,
} from "../src/utils";
import {
  SNOOZE_OPTIONS,
  getDefaultSnoozeMinutes,
} from "../src/services/snoozeSettings";
import { formatSnoozedTime } from "../src/services/doseTime";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { useReducedMotion } from "../src/hooks/useReducedMotion";
import { useToast } from "../src/context/ToastContext";
import { AppPressable } from "./AppPressable";

type Action = () => void | Promise<void>;
interface DoseCardProps {
  dose: TodayDose;
  onTake: Action;
  onSkip: (reason?: SkipReason) => void | Promise<void>;
  onSnooze: (minutes?: number) => void | Promise<void>;
  onRevert?: Action;
  onReschedule?: Action;
  onUpdateNote?: (note: string) => void | Promise<void>;
  onSetSite?: Action;
}

function Sheet({
  visible,
  title,
  onClose,
  busy,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "slide"}
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          onPress={close}
          accessible={false}
          className="flex-1 justify-end bg-black/50"
        >
          <Pressable
            onPress={() => {}}
            accessible={false}
            accessibilityViewIsModal
            className="bg-card rounded-t-3xl"
            style={{ maxHeight: "85%" }}
          >
            <View className="flex-row items-center justify-between pl-5 pr-2 pt-3 pb-2 gap-2">
              <Text
                accessibilityRole="header"
                className="text-xl font-bold text-text flex-1"
              >
                {title}
              </Text>
              <AppPressable
                disabled={busy}
                onPress={close}
                accessibilityLabel={t("common.cancel")}
                className="w-12 items-center justify-center"
              >
                <Ionicons name="close" size={24} color={theme.muted} />
              </AppPressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: Math.max(insets.bottom, 20) + 12,
              }}
            >
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function DoseCard({
  dose,
  onTake,
  onSkip,
  onSnooze,
  onRevert,
  onReschedule,
  onUpdateNote,
  onSetSite,
}: DoseCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const { showToast } = useToast();
  const senior = useAppStore((s) => s.seniorMode);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"skip" | "snooze" | "note" | null>(null);
  const [reason, setReason] = useState<SkipReason | undefined>();
  const [minutes, setMinutes] = useState(getDefaultSnoozeMinutes);
  const [note, setNote] = useState("");
  const completed = dose.status === "taken" || dose.status === "skipped";
  const color = getColorConfig(dose.medication.color);
  const time = dose.snoozedUntil
    ? formatSnoozedTime(dose.snoozedUntil)
    : formatTimeForDisplay(dose.scheduledTime);
  const badge = theme.statusBadge[dose.status];
  const status =
    dose.status === "missed"
      ? t("ux.unregistered")
      : t("status." + dose.status);

  async function run(action: Action, closeSheet = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
      if (closeSheet) setSheet(null);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      showToast(
        t(name.startsWith("Saved") ? "ux.savedWithWarning" : "ux.saveFailed"),
        "error"
      );
      if (name.startsWith("Saved") && closeSheet) setSheet(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const reasonKeys: SkipReason[] = [
    "forgot",
    "side_effect",
    "no_stock",
    "other",
  ];
  return (
    <>
      <View
        className="bg-card border border-border rounded-3xl p-4 mb-3"
        accessibilityState={{ busy }}
      >
        <View className="flex-row items-center justify-between gap-2 mb-3">
          <AppPressable
            disabled={completed || !onReschedule || busy}
            onPress={() => onReschedule && run(onReschedule)}
            accessibilityRole={onReschedule && !completed ? "button" : "text"}
            accessibilityLabel={time}
            accessibilityHint={
              onReschedule && !completed
                ? t("doseCard.rescheduleTitle")
                : undefined
            }
            className="flex-row items-center gap-2"
          >
            <Ionicons
              name={dose.snoozedUntil ? "alarm-outline" : "time-outline"}
              size={20}
              color={theme.primary}
            />
            <Text
              className="text-2xl font-bold text-text"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {time}
            </Text>
            {onReschedule && !completed && (
              <Ionicons name="pencil-outline" size={15} color={theme.muted} />
            )}
          </AppPressable>
          <View
            style={{
              backgroundColor: badge.bg,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 12,
            }}
          >
            <Text
              style={{ color: badge.color, fontSize: 13, fontWeight: "600" }}
            >
              {status}
            </Text>
          </View>
        </View>
        {dose.snoozedUntil && (
          <Text className="text-sm text-muted mb-2">
            {t("ux.originalTime", {
              time: formatTimeForDisplay(dose.scheduledTime),
            })}
          </Text>
        )}
        <View className="flex-row items-start gap-3">
          {dose.medication.photoUri ? (
            <Image
              source={{ uri: dose.medication.photoUri }}
              className="w-11 h-11 rounded-xl"
              accessible={false}
            />
          ) : (
            <View
              className="w-11 h-11 rounded-xl items-center justify-center"
              style={{
                backgroundColor: theme.cardAlt,
                borderLeftWidth: 4,
                borderLeftColor: color.bg,
              }}
            >
              <Ionicons
                name="medical-outline"
                size={23}
                color={theme.primary}
              />
            </View>
          )}
          <View className="flex-1">
            <AppPressable
              onPress={() =>
                router.push({
                  pathname: "/medication/[id]",
                  params: { id: dose.medication.id },
                })
              }
              accessibilityLabel={
                t("ux.viewMedicine") + ": " + dose.medication.name
              }
              style={{ minHeight: 0 }}
            >
              <Text
                className={`${
                  senior ? "text-2xl" : "text-xl"
                } font-bold text-text`}
              >
                {dose.medication.name}
              </Text>
            </AppPressable>
            <Text
              className={`${senior ? "text-lg" : "text-base"} text-muted mt-1`}
            >
              {getLocalizedDosage(dose.medication, t)}
            </Text>
          </View>
        </View>
        {dose.medication.notes ? (
          <Text className="text-base text-muted mt-3 leading-6">
            {dose.medication.notes}
          </Text>
        ) : null}
        {!completed ? (
          <View className="mt-4">
            <AppPressable
              disabled={busy}
              onPress={() => run(onTake)}
              accessibilityLabel={
                t("ux.recordTake") + ": " + dose.medication.name
              }
              className="bg-action rounded-2xl py-3.5 px-4 flex-row items-center justify-center gap-2"
              style={{ minHeight: senior ? 58 : 50 }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="checkmark" size={22} color="#fff" />
              )}
              <Text className="text-white text-base font-bold">
                {t("ux.recordTake")}
              </Text>
            </AppPressable>
            <View className="flex-row gap-2 mt-1">
              <AppPressable
                disabled={busy}
                onPress={() => {
                  setMinutes(getDefaultSnoozeMinutes());
                  setSheet("snooze");
                }}
                className="flex-1 rounded-xl px-2 py-3 flex-row justify-center items-center gap-2"
              >
                <Ionicons
                  name="alarm-outline"
                  size={19}
                  color={theme.primary}
                />
                <Text className="text-primary text-base font-semibold">
                  {t("doseCard.snooze")}
                </Text>
              </AppPressable>
              <AppPressable
                disabled={busy}
                onPress={() => {
                  setReason(undefined);
                  setSheet("skip");
                }}
                className="flex-1 rounded-xl px-2 py-3 flex-row justify-center items-center gap-2"
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={19}
                  color={theme.muted}
                />
                <Text className="text-muted text-base font-semibold">
                  {t("doseCard.skip")}
                </Text>
              </AppPressable>
            </View>
            {dose.snoozedUntil && onRevert && (
              <AppPressable
                disabled={busy}
                onPress={() => run(onRevert)}
                className="items-center px-3 py-2"
              >
                <Text className="text-muted text-sm">
                  {t("doseCard.revertSnooze")}
                </Text>
              </AppPressable>
            )}
          </View>
        ) : (
          <View className="mt-3">
            {dose.takenAt && (
              <Text className="text-base text-muted">
                {t("doseCard.takenAt", {
                  time: new Date(dose.takenAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }).trim()}
              </Text>
            )}
            {dose.skipReason && (
              <Text className="text-base text-muted">
                {t("doseCard.skipReason_" + dose.skipReason)}
              </Text>
            )}
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              {onUpdateNote && (
                <AppPressable
                  disabled={busy}
                  onPress={() => {
                    setNote(dose.notes ?? "");
                    setSheet("note");
                  }}
                  className="flex-1 flex-row items-center gap-2 py-2"
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <Text className="text-primary text-base flex-1">
                    {dose.notes || t("doseCard.addNote")}
                  </Text>
                </AppPressable>
              )}
              {onRevert && (
                <AppPressable
                  disabled={busy}
                  onPress={() => run(onRevert)}
                  className="px-3 py-2 flex-row items-center gap-2"
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={18}
                    color={theme.muted}
                  />
                  <Text className="text-muted text-base">
                    {t("doseCard.revert")}
                  </Text>
                </AppPressable>
              )}
            </View>
            {dose.status === "taken" &&
              dose.medication.isInjectable &&
              onSetSite && (
                <AppPressable
                  disabled={busy}
                  onPress={() => run(onSetSite)}
                  className="flex-row gap-2 items-center py-2"
                >
                  <Ionicons
                    name="locate-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <Text className="text-primary text-base">
                    {dose.injectionSite
                      ? t("sites." + dose.injectionSite)
                      : t("sites.record")}
                  </Text>
                </AppPressable>
              )}
          </View>
        )}
      </View>
      <Sheet
        visible={sheet === "skip"}
        title={t("doseCard.skipReasonTitle")}
        busy={busy}
        onClose={() => setSheet(null)}
      >
        <Text className="text-base text-muted mb-3">
          {dose.medication.name + " · " + time}
        </Text>
        {[undefined, ...reasonKeys].map((key) => (
          <AppPressable
            key={key ?? "none"}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === key }}
            onPress={() => setReason(key)}
            className="flex-row gap-3 items-center py-3.5 border-b border-border"
          >
            <Ionicons
              name={reason === key ? "radio-button-on" : "radio-button-off"}
              size={23}
              color={reason === key ? theme.primary : theme.muted}
            />
            <Text className="text-base text-text flex-1">
              {key
                ? t("doseCard.skipReason_" + key)
                : t("ux.skipWithoutReason")}
            </Text>
          </AppPressable>
        ))}
        <AppPressable
          disabled={busy}
          onPress={() => run(() => onSkip(reason), true)}
          className="bg-action items-center rounded-2xl py-3.5 mt-5"
        >
          <Text className="text-white text-base font-bold">
            {t("doseCard.skip")}
          </Text>
        </AppPressable>
        <AppPressable
          disabled={busy}
          onPress={() => setSheet(null)}
          className="items-center py-3 mt-1"
        >
          <Text className="text-muted text-base font-semibold">
            {t("common.cancel")}
          </Text>
        </AppPressable>
      </Sheet>
      <Sheet
        visible={sheet === "snooze"}
        title={t("doseCard.snoozePickerTitle")}
        busy={busy}
        onClose={() => setSheet(null)}
      >
        <Text className="text-base text-muted mb-4">
          {dose.medication.name + " · " + time}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SNOOZE_OPTIONS.map((value) => (
            <AppPressable
              key={value}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ checked: minutes === value }}
              onPress={() => setMinutes(value)}
              style={{
                width: "30%",
                backgroundColor:
                  minutes === value ? theme.actionFill : theme.cardAlt,
                borderRadius: 16,
                minHeight: 54,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: minutes === value ? theme.onAction : theme.text,
                  fontSize: 18,
                  fontWeight: "600",
                }}
              >
                {value} min
              </Text>
            </AppPressable>
          ))}
        </View>
        <AppPressable
          disabled={busy}
          onPress={() => run(() => onSnooze(minutes), true)}
          className="bg-action rounded-2xl items-center py-3.5 mt-5"
        >
          <Text className="text-white text-base font-bold">
            {t("doseCard.snooze")} {minutes} min
          </Text>
        </AppPressable>
        <AppPressable
          disabled={busy}
          onPress={() => setSheet(null)}
          className="items-center py-3 mt-1"
        >
          <Text className="text-muted text-base font-semibold">
            {t("common.cancel")}
          </Text>
        </AppPressable>
      </Sheet>
      <Sheet
        visible={sheet === "note"}
        title={t("doseCard.noteModalTitle")}
        busy={busy}
        onClose={() => setSheet(null)}
      >
        <TextInput
          value={note}
          onChangeText={setNote}
          editable={!busy}
          placeholder={t("doseCard.noteModalPlaceholder")}
          accessibilityLabel={t("doseCard.noteModalTitle")}
          placeholderTextColor={theme.muted}
          multiline
          maxLength={200}
          autoFocus
          className="bg-card-alt border border-border text-text text-base rounded-2xl p-4"
          style={{ minHeight: 110, textAlignVertical: "top" }}
        />
        <AppPressable
          disabled={busy}
          onPress={() => run(() => onUpdateNote?.(note.trim()), true)}
          className="bg-action rounded-2xl items-center py-3.5 mt-5"
        >
          <Text className="text-white text-base font-bold">
            {t("common.save")}
          </Text>
        </AppPressable>
        <AppPressable
          disabled={busy}
          onPress={() => setSheet(null)}
          className="items-center py-3 mt-1"
        >
          <Text className="text-muted text-base font-semibold">
            {t("common.cancel")}
          </Text>
        </AppPressable>
      </Sheet>
    </>
  );
}
