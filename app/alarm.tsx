import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useAppStore } from "../src/store";
import {
  formatTimeForDisplay,
  getLocalizedDosageLong,
  getProfileLabel,
  isScheduleActiveOnDate,
} from "../src/utils";
import {
  SNOOZE_OPTIONS,
  getDefaultSnoozeMinutes,
} from "../src/services/snoozeSettings";
import { useTranslation } from "../src/i18n";
import {
  stopAlarm,
  dismissAlarm,
  setAlarmWindowFlags,
  clearAlarmWindowFlags,
} from "expo-alarm";
import {
  getMedications,
  getDoseLogByScheduleAndDate,
  setDoseInjectionSite,
  getDoseLogsByDateRange,
} from "../src/db/database";
import {
  speakDoseReminder,
  stopSpeaking,
  isTtsEnabled,
} from "../src/services/tts";
import { withEffectiveDose } from "../src/services/regimen";
import {
  effectiveDoseDateTime,
  formatSnoozedTime,
} from "../src/services/doseTime";
import { SavedDoseError } from "../src/store/slices/medications";
import type { Medication, DoseLog, TodayDose } from "../src/types";
import { AppPressable } from "../components/AppPressable";
import { SitePickerModal } from "../components/SitePickerModal";
import {
  suggestNextSite,
  type InjectionSite,
} from "../src/services/injectionSites";
import { useAppTheme } from "../src/hooks/useAppTheme";

type Action = "taken" | "skipped" | "snooze";
export default function AlarmScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { scheduleId, date, action, time } = useLocalSearchParams<{
    scheduleId: string;
    date: string;
    action?: string;
    time?: string;
  }>();
  const medications = useAppStore((state) => state.medications);
  const schedules = useAppStore((state) => state.schedules);
  const profiles = useAppStore((state) => state.profiles);
  const isLoading = useAppStore((state) => state.isLoading);
  const todayLogs = useAppStore((state) => state.todayLogs);
  const snoozedTimes = useAppStore((state) => state.snoozedTimes);
  const markDose = useAppStore((state) => state.markDose);
  const snoozeDose = useAppStore((state) => state.snoozeDose);
  const [allMeds, setAllMeds] = useState<Medication[] | null>(null);
  const [priorLog, setPriorLog] = useState<DoseLog | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const quickAction = useRef("");
  const spoken = useRef(false);
  const [siteVisible, setSiteVisible] = useState(false);
  const [suggestedSite, setSuggestedSite] = useState<InjectionSite | null>(
    null
  );
  const schedule = schedules.find((item) => item.id === scheduleId);
  const base = schedule
    ? medications.find((item) => item.id === schedule.medicationId) ??
      allMeds?.find((item) => item.id === schedule.medicationId)
    : undefined;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "");
  const medication = useMemo(
    () => (base && validDate ? withEffectiveDose(base, date) : undefined),
    [base, validDate, date]
  );
  const currentLog =
    todayLogs.find(
      (log) => log.scheduleId === scheduleId && log.scheduledDate === date
    ) ?? priorLog;
  const alreadyRecorded =
    currentLog?.status === "taken" || currentLog?.status === "skipped";
  const postponed = snoozedTimes[`${scheduleId}-${date}`];
  const effectiveTime =
    time ??
    (postponed
      ? format(
          effectiveDoseDateTime(date, schedule?.time ?? "00:00", postponed),
          "HH:mm"
        )
      : schedule?.time);
  const dose = useMemo<TodayDose | null>(
    () =>
      medication && schedule && validDate
        ? {
            medication,
            schedule,
            scheduledDate: date,
            scheduledTime: effectiveTime ?? schedule.time,
            snoozedUntil: postponed,
            status: "pending",
          }
        : null,
    [medication, schedule, validDate, date, effectiveTime, postponed]
  );
  const exit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
  // Set once the screen has resolved the ring (recorded, snoozed or closed) so
  // unmounting does not dismiss again and re-arm a reminder for a logged dose.
  const handled = useRef(false);
  const close = useCallback(async () => {
    handled.current = true;
    stopSpeaking();
    await stopAlarm().catch(() => {});
    exit();
  }, [exit]);
  // Closing with the dose still pending must keep it reminding: silence the
  // ring, leave the quiet reminder and re-arm the next auto-reminder.
  const dismiss = useCallback(async () => {
    handled.current = true;
    stopSpeaking();
    await (alreadyRecorded ? stopAlarm() : dismissAlarm()).catch(() => {});
    exit();
  }, [exit, alreadyRecorded]);
  useEffect(() => {
    let live = true;
    setReadFailed(false);
    Promise.all([
      getMedications(),
      validDate
        ? getDoseLogByScheduleAndDate(scheduleId, date)
        : Promise.resolve(null),
    ])
      .then(([meds, log]) => {
        if (live) {
          setAllMeds(meds);
          setPriorLog(log);
        }
      })
      .catch(() => {
        if (live) setReadFailed(true);
      });
    return () => {
      live = false;
    };
  }, [scheduleId, date, validDate, retry]);
  useEffect(() => {
    setAlarmWindowFlags().catch(() => {});
    // Block the hardware/predictive back gesture so a brush cannot close the
    // alarm by accident; "Close reminder" is the explicit way out.
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => {
      back.remove();
      clearAlarmWindowFlags().catch(() => {});
      stopSpeaking();
      if (!handled.current) void dismissAlarm().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (
      !medication ||
      action ||
      spoken.current ||
      allMeds === null ||
      alreadyRecorded
    )
      return;
    spoken.current = true;
    // Let the spoken reminder replace the alarm loop only when voice is enabled.
    if (isTtsEnabled())
      void stopAlarm()
        .then(() =>
          speakDoseReminder(
            medication.name,
            getLocalizedDosageLong(medication, t)
          )
        )
        .catch(() => {});
  }, [medication, action, allMeds, alreadyRecorded, t]);

  const perform = useCallback(
    async (
      kind: Action,
      minutes?: number,
      target: TodayDose | null = dose,
      isCo = false
    ) => {
      if (!target || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const existing = await getDoseLogByScheduleAndDate(
          target.schedule.id,
          target.scheduledDate
        );
        if (existing?.status === "taken" || existing?.status === "skipped") {
          if (!isCo) {
            setPriorLog(existing);
            await close();
          }
          return;
        }
        if (!isCo) {
          handled.current = true;
          stopSpeaking();
          await stopAlarm();
        }
        if (kind === "snooze") await snoozeDose(target, minutes);
        else await markDose(target, kind, noteText.trim() || undefined);
        if (
          !isCo &&
          kind === "taken" &&
          target.medication.isInjectable &&
          !action
        ) {
          try {
            const from = new Date();
            from.setDate(from.getDate() - 90);
            const logs = await getDoseLogsByDateRange(
              format(from, "yyyy-MM-dd"),
              format(new Date(), "yyyy-MM-dd")
            );
            setSuggestedSite(
              suggestNextSite(
                logs.filter((log) => log.medicationId === target.medication.id)
              )
            );
          } catch {
            setSuggestedSite(null);
          }
          setSiteVisible(true);
        } else if (!isCo) exit();
      } catch (error) {
        if (error instanceof SavedDoseError)
          Alert.alert(
            t("uxMedication.registered"),
            t("uxMedication.registeredWarning")
          );
        else Alert.alert(t("common.error"), t("uxMedication.operationError"));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [dose, close, snoozeDose, markDose, noteText, action, exit, t]
  );
  useEffect(() => {
    if (!action || !dose || allMeds === null || isLoading || readFailed) return;
    const key = `${scheduleId}-${date}-${action}`;
    if (quickAction.current === key) return;
    quickAction.current = key;
    if (action === "taken" || action === "skipped" || action === "snooze")
      void perform(action);
    else void close();
  }, [
    action,
    dose,
    allMeds,
    isLoading,
    readFailed,
    scheduleId,
    date,
    perform,
    close,
  ]);

  const coDue = useMemo(() => {
    if (!dose || !validDate) return [];
    const originalDate = new Date(date + "T12:00");
    const mainTime = effectiveDoseDateTime(
      date,
      schedule?.time ?? "00:00",
      postponed ?? (time ? time : undefined)
    ).getTime();
    return schedules
      .filter((item) => item.id !== scheduleId)
      .flatMap((item): TodayDose[] => {
        const owner = (allMeds ?? medications).find(
          (med) => med.id === item.medicationId
        );
        const log = todayLogs.find(
          (entry) =>
            entry.scheduleId === item.id && entry.scheduledDate === date
        );
        const snoozedUntil = snoozedTimes[`${item.id}-${date}`];
        if (
          !owner ||
          !isScheduleActiveOnDate(item, originalDate, owner) ||
          (log && log.status !== "pending") ||
          effectiveDoseDateTime(date, item.time, snoozedUntil).getTime() !==
            mainTime
        )
          return [];
        return [
          {
            medication: withEffectiveDose(owner, date),
            schedule: item,
            scheduledDate: date,
            scheduledTime: item.time,
            snoozedUntil,
            status: "pending",
          },
        ];
      });
  }, [
    dose,
    validDate,
    date,
    schedule,
    postponed,
    time,
    schedules,
    scheduleId,
    allMeds,
    medications,
    todayLogs,
    snoozedTimes,
  ]);

  if (isLoading || (allMeds === null && !readFailed))
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={theme.primary} />
        <AppPressable
          accessibilityRole="button"
          onPress={dismiss}
          className="py-4 px-6 mt-4"
        >
          <Text className="text-primary text-base">
            {t("uxMedication.closeReminder")}
          </Text>
        </AppPressable>
      </SafeAreaView>
    );
  if (!dose || !medication || readFailed)
    return (
      <SafeAreaView className="flex-1 bg-background justify-center px-6">
        <Text className="text-lg text-text mb-5">
          {t(
            readFailed ? "uxMedication.operationError" : "uxMedication.missing"
          )}
        </Text>
        {readFailed && (
          <AppPressable
            onPress={() => setRetry((value) => value + 1)}
            className="bg-action rounded-xl p-4 mb-3"
          >
            <Text className="text-white text-base">
              {t("uxMedication.retry")}
            </Text>
          </AppPressable>
        )}
        <AppPressable
          accessibilityRole="button"
          // A dose that no longer exists must not keep re-reminding; a read
          // failure may still hide a pending dose, so that one stays armed.
          onPress={readFailed ? dismiss : close}
          className="py-4"
        >
          <Text className="text-primary text-base">
            {t("uxMedication.closeReminder")}
          </Text>
        </AppPressable>
      </SafeAreaView>
    );
  const owner = getProfileLabel(medication, profiles, t);
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingBottom: 20 }}
        >
          <Text className="text-base text-muted">
            {owner ?? t("profiles.me")}
          </Text>
          <Text className="text-5xl text-text font-bold mt-2">
            {formatTimeForDisplay(effectiveTime ?? schedule!.time)}
          </Text>
          <View className="w-14 h-14 rounded-2xl bg-card border border-border items-center justify-center mt-6">
            <Ionicons name="medical-outline" size={30} color={theme.primary} />
          </View>
          <Text
            accessibilityRole="header"
            className="text-3xl font-bold text-text mt-4"
          >
            {medication.name}
          </Text>
          <Text className="text-xl text-text font-semibold mt-3">
            {getLocalizedDosageLong(medication, t)}
          </Text>
          {postponed && (
            <Text className="text-base text-muted mt-2">
              {formatSnoozedTime(postponed)}
            </Text>
          )}
          {medication.notes && (
            <Text className="text-base text-muted mt-4">
              {medication.notes}
            </Text>
          )}
          {alreadyRecorded ? (
            <Text
              accessibilityRole="alert"
              className="text-lg text-primary font-semibold mt-5"
            >
              {t(`status.${currentLog!.status}`)}
              {currentLog?.takenAt
                ? ` · ${format(new Date(currentLog.takenAt), "HH:mm")}`
                : ""}
            </Text>
          ) : (
            <>
              <AppPressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showNote }}
                disabled={busy}
                onPress={() => setShowNote((value) => !value)}
                className="py-4 mt-2"
              >
                <Text className="text-base text-primary">
                  {t("doseCard.addNote")}
                </Text>
              </AppPressable>
              {showNote && (
                <TextInput
                  accessibilityLabel={t("doseCard.noteModalTitle")}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder={t("doseCard.noteModalPlaceholder")}
                  placeholderTextColor={theme.muted}
                  multiline
                  maxLength={200}
                  className="text-base text-text bg-card border border-border rounded-xl px-4 py-3"
                />
              )}
              {coDue.length > 0 && (
                <View className="mt-5">
                  <Text className="text-base font-semibold text-text mb-3">
                    {t("alarm.alsoDue", { count: coDue.length })}
                  </Text>
                  {coDue.map((co) => (
                    <View
                      key={co.schedule.id}
                      className="bg-card border border-border rounded-2xl p-4 mb-3"
                    >
                      <Text className="text-base text-muted">
                        {getProfileLabel(co.medication, profiles, t) ??
                          t("profiles.me")}
                      </Text>
                      <Text className="text-lg font-semibold text-text mt-1">
                        {co.medication.name}
                      </Text>
                      <Text className="text-base text-text mt-1">
                        {getLocalizedDosageLong(co.medication, t)}
                      </Text>
                      <View className="flex-row gap-3 mt-3">
                        <AppPressable
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`${t(
                            "uxMedication.recordTaken"
                          )} ${co.medication.name}`}
                          onPress={() => perform("taken", undefined, co, true)}
                          className="flex-1 bg-action rounded-xl py-3 px-3 items-center"
                        >
                          <Text className="text-base text-white font-semibold">
                            {t("uxMedication.recordTaken")}
                          </Text>
                        </AppPressable>
                        <AppPressable
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`${t("alarm.skip")} ${
                            co.medication.name
                          }`}
                          onPress={() =>
                            perform("skipped", undefined, co, true)
                          }
                          className="py-3 px-4 rounded-xl border border-border"
                        >
                          <Text className="text-base text-muted">
                            {t("doseCard.skip")}
                          </Text>
                        </AppPressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {showSnoozeOptions && (
                <View className="mt-4">
                  <Text className="text-lg text-text font-bold mb-3">
                    {t("alarm.snoozePickerTitle")}
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    {SNOOZE_OPTIONS.map((minutes) => (
                      <AppPressable
                        disabled={busy}
                        key={minutes}
                        accessibilityRole="button"
                        accessibilityLabel={t("alarm.snoozeOption", {
                          minutes,
                        })}
                        onPress={() => perform("snooze", minutes)}
                        className={`py-4 px-5 rounded-xl border ${
                          minutes === getDefaultSnoozeMinutes()
                            ? "bg-action border-primary"
                            : "bg-card border-border"
                        }`}
                      >
                        <Text
                          className={`text-base font-semibold ${
                            minutes === getDefaultSnoozeMinutes()
                              ? "text-white"
                              : "text-text"
                          }`}
                        >
                          {minutes} min
                        </Text>
                      </AppPressable>
                    ))}
                  </View>
                  <AppPressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => setShowSnoozeOptions(false)}
                    className="py-4"
                  >
                    <Text className="text-base text-primary">
                      {t("common.cancel")}
                    </Text>
                  </AppPressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
        <View className="px-6 py-4 bg-background border-t border-border gap-2">
          {!alreadyRecorded && (
            <>
              <AppPressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
                disabled={busy}
                accessibilityLabel={`${t("uxMedication.recordTaken")} ${
                  medication.name
                } ${getLocalizedDosageLong(medication, t)}`}
                onPress={() => perform("taken")}
                className="bg-action rounded-xl py-4 px-3 items-center"
              >
                <Text className="text-white text-lg font-bold">
                  {t(busy ? "uxMedication.taking" : "uxMedication.recordTaken")}
                </Text>
              </AppPressable>
              <View className="flex-row gap-3">
                <AppPressable
                  disabled={busy}
                  accessibilityRole="button"
                  onPress={() => setShowSnoozeOptions((value) => !value)}
                  className="flex-1 rounded-xl py-3 items-center border border-border"
                >
                  <Text className="text-base text-primary font-semibold">
                    {t("alarm.snooze")}
                  </Text>
                </AppPressable>
                <AppPressable
                  disabled={busy}
                  accessibilityRole="button"
                  onPress={() => perform("skipped")}
                  className="flex-1 rounded-xl py-3 items-center border border-border"
                >
                  <Text className="text-base text-muted">
                    {t("doseCard.skip")}
                  </Text>
                </AppPressable>
              </View>
            </>
          )}
          <AppPressable
            accessibilityRole="button"
            accessibilityHint={t("uxMedication.closeHint")}
            disabled={busy}
            onPress={dismiss}
            className="py-3 items-center"
          >
            <Text className="text-base text-muted">
              {t("uxMedication.closeReminder")}
            </Text>
          </AppPressable>
        </View>
      </KeyboardAvoidingView>
      <SitePickerModal
        visible={siteVisible}
        suggested={suggestedSite}
        onClose={() => {
          setSiteVisible(false);
          exit();
        }}
        onPick={async (site) => {
          try {
            await setDoseInjectionSite(
              dose.schedule.id,
              dose.scheduledDate,
              site
            );
            setSiteVisible(false);
            exit();
          } catch {
            Alert.alert(t("common.error"), t("uxMedication.operationError"));
          }
        }}
      />
    </SafeAreaView>
  );
}
