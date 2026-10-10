import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Platform,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CopilotStep, walkthroughable, useCopilot } from "react-native-copilot";
import { storage } from "../../src/storage";
import { STORAGE_KEYS } from "../../src/config";
import { useAppStore } from "../../src/store";
import { useTodaySchedule } from "../../src/hooks/useTodaySchedule";
import { DoseCard } from "../../components/DoseCard";
import { EmptyState } from "../../components/EmptyState";
import { CheckinModal } from "../../components/CheckinModal";
import { AppointmentMiniCard } from "../../components/AppointmentMiniCard";
import { ProfileChip } from "../../components/ProfileChip";
import { SitePickerModal } from "../../components/SitePickerModal";
import { AppPressable } from "../../components/AppPressable";
import {
  suggestNextSite,
  type InjectionSite,
} from "../../src/services/injectionSites";
import { setDoseInjectionSite } from "../../src/db/database";
import { effectiveDoseDateTime } from "../../src/services/doseTime";
import {
  isAppointmentPast,
  isMedicationCurrent,
} from "../../src/services/carePlan";
import { getDefaultSnoozeMinutes } from "../../src/services/snoozeSettings";
import { prnWarningMessage } from "../../src/services/prnLimits";
import type { TodayDose, SkipReason, Medication } from "../../src/types";
import { formatTimeForDisplay, getLocalizedDosage } from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { useToast } from "../../src/context/ToastContext";
import BrandMark from "../../components/BrandMark";

const WalkthroughableView = walkthroughable(View);
export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { showToast } = useToast();
  const store = useAppStore();
  const { loadDailyCheckins, loadTodayLogs } = store;
  const doses = useTodaySchedule();
  const copilot = useCopilot();
  const [refreshing, setRefreshing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<TodayDose | null>(
    null
  );
  const [pickerDraft, setPickerDraft] = useState(new Date());
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [siteDose, setSiteDose] = useState<TodayDose | null>(null);
  const [siteSuggestion, setSiteSuggestion] = useState<InjectionSite | null>(
    null
  );
  const [siteBusy, setSiteBusy] = useState(false);
  const [checkinVisible, setCheckinVisible] = useState(false);
  const [checkinDismissed, setCheckinDismissed] = useState(false);
  const [prnBusy, setPrnBusy] = useState<string | null>(null);
  const prnLock = useRef(false);
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const outstanding = doses.filter(
    (d) => d.status === "pending" || d.status === "missed"
  );
  const done = doses.filter(
    (d) => d.status === "taken" || d.status === "skipped"
  );
  const taken = doses.filter((d) => d.status === "taken").length;
  const skipped = doses.filter((d) => d.status === "skipped").length;
  const prnMeds = store.medications.filter(
    (m) => m.isPRN && isMedicationCurrent(m)
  );
  const profile = store.profiles.find((p) => p.id === store.activeProfileId);
  const person = profile?.name || t("ux.me");
  const checkin = store.dailyCheckins.find((c) => c.date === todayKey);
  const upcoming = store.appointments
    .filter((a) => !isAppointmentPast(a))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "").localeCompare(b.time ?? "")
    )
    .slice(0, 2);
  const dateLabel = format(new Date(), "EEEE d MMMM", {
    locale: getDateLocale(),
  });
  useEffect(() => {
    const stop = () => storage.set(STORAGE_KEYS.TOUR_DONE, "1");
    copilot.copilotEvents.on("stop", stop);
    return () => copilot.copilotEvents.off("stop", stop);
  }, [copilot.copilotEvents]);
  useFocusEffect(
    useCallback(() => {
      loadDailyCheckins().catch(() => {});
      loadTodayLogs().catch(() => showToast(t("ux.refreshFailed"), "error"));
      setCheckinDismissed(
        storage.getString(STORAGE_KEYS.CHECKIN_DISMISSED_DATE) ===
          format(new Date(), "yyyy-MM-dd")
      );
    }, [loadDailyCheckins, loadTodayLogs, showToast, t])
  );
  useEffect(() => {
    setCheckinDismissed(
      storage.getString(STORAGE_KEYS.CHECKIN_DISMISSED_DATE) === todayKey
    );
  }, [todayKey, store.activeProfileId]);

  async function refresh() {
    setRefreshing(true);
    try {
      await store.loadAll();
      await store.loadDailyCheckins();
    } catch {
      showToast(t("ux.refreshFailed"), "error");
    } finally {
      setRefreshing(false);
    }
  }
  async function openSite(dose: TodayDose) {
    try {
      const from = format(new Date(Date.now() - 90 * 86400000), "yyyy-MM-dd");
      const logs = (await store.getHistoryLogs(from, todayKey)).filter(
        (l) => l.medicationId === dose.medication.id
      );
      setSiteSuggestion(suggestNextSite(logs));
    } catch {
      setSiteSuggestion(null);
    }
    setSiteDose(dose);
  }
  async function mark(
    dose: TodayDose,
    status: "taken" | "skipped",
    reason?: SkipReason
  ) {
    await store.markDose(dose, status, undefined, reason);
    showToast(
      status === "taken" ? t("ux.prnSaved") : t("status.skipped"),
      "success"
    );
    if (status === "taken" && dose.medication.isInjectable)
      await openSite(dose);
  }
  async function saveSite(site: InjectionSite) {
    if (!siteDose || siteBusy) return;
    setSiteBusy(true);
    try {
      await setDoseInjectionSite(
        siteDose.schedule.id,
        siteDose.scheduledDate,
        site
      );
      await store.loadTodayLogs();
      setSiteDose(null);
      showToast(t("ux.siteSaved"), "success");
    } catch {
      showToast(t("ux.saveFailed"), "error");
    } finally {
      setSiteBusy(false);
    }
  }
  function openReschedule(dose: TodayDose) {
    setPickerDraft(
      effectiveDoseDateTime(
        dose.scheduledDate,
        dose.scheduledTime,
        dose.snoozedUntil
      )
    );
    setRescheduleTarget(dose);
  }
  async function confirmReschedule(date: Date, target = rescheduleTarget) {
    if (!target || rescheduleBusy) return;
    const chosen = new Date();
    chosen.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (chosen.getTime() <= Date.now()) {
      showToast(t("ux.pastTime"), "error");
      return;
    }
    setRescheduleBusy(true);
    try {
      const time = format(chosen, "HH:mm");
      await store.rescheduleOnce(target, time);
      setRescheduleTarget(null);
      showToast(
        t("doseCard.rescheduleConfirm", { time: formatTimeForDisplay(time) }),
        "info"
      );
    } catch {
      showToast(t("ux.saveFailed"), "error");
    } finally {
      setRescheduleBusy(false);
    }
  }
  function onNativeTime(event: DateTimePickerEvent, date?: Date) {
    const target = rescheduleTarget;
    setRescheduleTarget(null);
    if (event.type === "set" && date) void confirmReschedule(date, target);
  }
  async function logPRN(med: Medication, force = false) {
    if (prnLock.current) return;
    prnLock.current = true;
    setPrnBusy(med.id);
    try {
      const check = await store.logPRNDose(
        med,
        force ? { force: true } : undefined
      );
      if (check?.blocked) {
        Alert.alert(t("prn.limitTitle"), prnWarningMessage(t, med, check), [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("prn.logAnyway"),
            style: "destructive",
            onPress: () => {
              void logPRN(med, true);
            },
          },
        ]);
      } else showToast(t("ux.prnSaved"), "success");
    } catch (e) {
      showToast(
        t(
          e instanceof Error && e.name.startsWith("Saved")
            ? "ux.savedWithWarning"
            : "ux.saveFailed"
        ),
        "error"
      );
    } finally {
      prnLock.current = false;
      setPrnBusy(null);
    }
  }
  function confirmPRN(med: Medication) {
    Alert.alert(
      t("medicationCard.logPRNTitle"),
      t("medicationCard.logPRNConfirm", { name: med.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("medicationCard.logPRNConfirmBtn"),
          onPress: () => {
            void logPRN(med);
          },
        },
      ]
    );
  }
  function renderDose(dose: TodayDose) {
    const completed = dose.status === "taken" || dose.status === "skipped";
    return (
      <DoseCard
        key={dose.schedule.id + "-" + dose.scheduledDate}
        dose={dose}
        onTake={() => mark(dose, "taken")}
        onSkip={(reason) => mark(dose, "skipped", reason)}
        onSnooze={async (minutes) => {
          await store.snoozeDose(dose, minutes);
          showToast(
            t("doseCard.snoozeConfirm", {
              minutes: minutes ?? getDefaultSnoozeMinutes(),
            }),
            "info"
          );
        }}
        onReschedule={() => openReschedule(dose)}
        onRevert={
          completed
            ? async () => {
                await store.revertDose(dose);
                showToast(t("ux.undoDone"), "info");
              }
            : dose.snoozedUntil
            ? async () => {
                await store.revertSnooze(dose);
                showToast(t("ux.snoozeUndone"), "info");
              }
            : undefined
        }
        onUpdateNote={
          completed
            ? async (note) => {
                await store.updateDoseNote(
                  dose.schedule.id,
                  dose.scheduledDate,
                  note
                );
                showToast(t("ux.noteSaved"), "success");
              }
            : undefined
        }
        onSetSite={() => openSite(dose)}
      />
    );
  }
  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row gap-2 items-center flex-1">
            <BrandMark size={30} />
            <Text className="text-3xl font-bold text-text">
              {t("home.title")}
            </Text>
          </View>
          <CopilotStep
            text="tour.step1Title||tour.step1Desc"
            order={1}
            name="addMedication"
          >
            <WalkthroughableView>
              <AppPressable
                onPress={() => router.push("/medication/new")}
                accessibilityLabel={t("ux.addMedication")}
                className="bg-action w-12 h-12 rounded-2xl items-center justify-center"
              >
                <Ionicons name="add" size={28} color="#fff" />
              </AppPressable>
            </WalkthroughableView>
          </CopilotStep>
        </View>
        <Text className="text-base text-muted mt-1 capitalize">
          {dateLabel}
        </Text>
        <View className="flex-row items-center justify-between gap-3 mt-2">
          <Text className="text-base text-text font-semibold flex-1">
            {profile?.name
              ? t("ux.profile", { name: person })
              : t("ux.personalAgenda")}
          </Text>
          <ProfileChip />
        </View>
        <View className="flex-row gap-3 border-b border-border pb-2 mt-1">
          <AppPressable
            onPress={() => router.push("/(tabs)/calendar")}
            className="flex-row items-center gap-2 py-2 px-1"
          >
            <Ionicons name="calendar-outline" size={19} color={theme.primary} />
            <Text className="text-primary text-base font-semibold">
              {t("home.navCalendar")}
            </Text>
          </AppPressable>
          <CopilotStep
            text="tour.step4Title||tour.step4Desc"
            order={4}
            name="appointmentsShortcut"
          >
            <WalkthroughableView>
              <AppPressable
                onPress={() => router.push("/(tabs)/appointments")}
                className="flex-row items-center gap-2 py-2 px-1"
              >
                <Ionicons
                  name="medical-outline"
                  size={19}
                  color={theme.primary}
                />
                <Text className="text-primary text-base font-semibold">
                  {t("tabs.appointments")}
                </Text>
              </AppPressable>
            </WalkthroughableView>
          </CopilotStep>
        </View>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.primary}
          />
        }
      >
        <CopilotStep
          text="tour.step2Title||tour.step2Desc"
          order={2}
          name="todayPlan"
        >
          <WalkthroughableView>
            {store.isLoading && doses.length === 0 ? (
              <View className="py-12 items-center gap-3">
                <ActivityIndicator color={theme.primary} />
                <Text className="text-muted text-base">
                  {t("ux.loadingTitle")}
                </Text>
              </View>
            ) : (
              <>
                {doses.length > 0 && (
                  <View className="py-3 mb-2">
                    <Text
                      accessibilityRole="header"
                      className="text-xl text-text font-bold"
                    >
                      {t("ux.todayPlan")}
                    </Text>
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                      <Text className="text-base text-muted">
                        {taken}/{doses.length} {t("ux.taken").toLowerCase()}
                      </Text>
                      {skipped > 0 && (
                        <Text className="text-base text-muted">
                          {skipped} {t("ux.skipped").toLowerCase()}
                        </Text>
                      )}
                      <Text className="text-base text-muted">
                        {t("ux.remaining", { count: outstanding.length })}
                      </Text>
                    </View>
                    <View
                      className="h-1.5 bg-card-alt rounded-full mt-3 overflow-hidden"
                      accessible
                      accessibilityRole="progressbar"
                      accessibilityLabel={t("ux.taken")}
                      accessibilityValue={{
                        min: 0,
                        max: doses.length,
                        now: taken,
                      }}
                    >
                      <View
                        style={{
                          width: `${(100 * taken) / doses.length}%`,
                          backgroundColor: theme.success,
                          height: "100%",
                          borderRadius: 4,
                        }}
                      />
                    </View>
                  </View>
                )}
                {outstanding.length > 0 ? (
                  <>
                    <Text
                      accessibilityRole="header"
                      className="text-base font-semibold text-muted mb-2"
                    >
                      {outstanding[0].status === "missed"
                        ? t("ux.unregistered")
                        : t("ux.next")}
                    </Text>
                    {outstanding.map(renderDose)}
                  </>
                ) : doses.length > 0 ? (
                  <View className="bg-card rounded-3xl border border-border p-5 mb-3 flex-row items-center gap-3">
                    <Ionicons
                      name={
                        skipped
                          ? "checkmark-circle-outline"
                          : "checkmark-circle"
                      }
                      color={theme.success}
                      size={30}
                    />
                    <Text className="text-text text-lg font-semibold flex-1">
                      {t(skipped ? "ux.dayRecorded" : "ux.allTaken")}
                    </Text>
                  </View>
                ) : (
                  <EmptyState
                    illustration="noMeds"
                    title={t("ux.noDoses")}
                    subtitle={
                      prnMeds.length ? t("ux.emptyPRN") : t("ux.noDosesHint")
                    }
                    actionLabel={
                      store.medications.length
                        ? t("ux.manageMedication")
                        : t("ux.addMedication")
                    }
                    onAction={() =>
                      router.push(
                        store.medications.length
                          ? "/(tabs)/medications"
                          : "/medication/new"
                      )
                    }
                  />
                )}
                {done.length > 0 && (
                  <View className="mb-4">
                    <AppPressable
                      accessibilityState={{ expanded: showDone }}
                      onPress={() => setShowDone(!showDone)}
                      className="flex-row items-center justify-between py-3 gap-2"
                    >
                      <Text className="text-base text-primary font-semibold flex-1">
                        {t(showDone ? "ux.hideRecorded" : "ux.showRecorded")} (
                        {done.length})
                      </Text>
                      <Ionicons
                        name={showDone ? "chevron-up" : "chevron-down"}
                        color={theme.primary}
                        size={20}
                      />
                    </AppPressable>
                    {showDone && done.map(renderDose)}
                  </View>
                )}
              </>
            )}
          </WalkthroughableView>
        </CopilotStep>
        {prnMeds.length > 0 && (
          <View className="mb-5">
            <Text
              accessibilityRole="header"
              className="text-xl font-bold text-text mb-3"
            >
              {t("home.sectionPRN")}
            </Text>
            {prnMeds.map((med) => {
              const count = store.todayLogs.filter(
                (l) =>
                  l.medicationId === med.id &&
                  l.scheduledDate === todayKey &&
                  l.status === "taken"
              ).length;
              return (
                <View
                  key={med.id}
                  className="bg-card border border-border rounded-3xl p-4 mb-3"
                >
                  <AppPressable
                    onPress={() =>
                      router.push({
                        pathname: "/medication/[id]",
                        params: { id: med.id },
                      })
                    }
                    style={{ minHeight: 0 }}
                  >
                    <Text className="text-xl font-bold text-text">
                      {med.name}
                    </Text>
                  </AppPressable>
                  <Text className="text-base text-muted mt-1">
                    {getLocalizedDosage(med, t)}
                    {count
                      ? " · " + count + " " + t("ux.taken").toLowerCase()
                      : ""}
                  </Text>
                  <AppPressable
                    disabled={prnBusy !== null}
                    onPress={() => confirmPRN(med)}
                    className="border border-primary rounded-2xl px-4 py-3 mt-3 items-center"
                  >
                    <Text className="text-base font-semibold text-primary">
                      {prnBusy === med.id
                        ? t("common.loading")
                        : t("home.prnLogDose")}
                    </Text>
                  </AppPressable>
                </View>
              );
            })}
          </View>
        )}
        {(upcoming.length > 0 || (!checkin && !checkinDismissed)) && (
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-text mb-3"
          >
            {t("ux.care")}
          </Text>
        )}
        {upcoming.map((appt) => (
          <AppointmentMiniCard
            key={appt.id}
            appt={appt}
            onPress={() => store.setSelectedAppointmentId(appt.id)}
          />
        ))}
        {!checkin && !checkinDismissed && (
          <View className="bg-card border border-border rounded-3xl p-4 mt-2">
            <View className="flex-row items-center gap-3">
              <Ionicons name="heart-outline" size={24} color={theme.primary} />
              <View className="flex-1">
                <Text className="text-lg font-semibold text-text">
                  {t("checkin.homePromptTitle")}
                </Text>
                <Text className="text-base text-muted mt-1">
                  {t("checkin.homePromptSubtitle")}
                </Text>
              </View>
              <AppPressable
                onPress={() => {
                  storage.set(STORAGE_KEYS.CHECKIN_DISMISSED_DATE, todayKey);
                  setCheckinDismissed(true);
                }}
                accessibilityLabel={t("ux.checkinLater")}
                className="w-11 items-center justify-center"
              >
                <Ionicons name="close" size={21} color={theme.muted} />
              </AppPressable>
            </View>
            <AppPressable
              onPress={() => setCheckinVisible(true)}
              className="self-start py-2 mt-2"
            >
              <Text className="text-primary text-base font-semibold">
                {t("checkin.saveButton")}
              </Text>
            </AppPressable>
          </View>
        )}
        <AppPressable
          onPress={() => {
            copilot.start();
          }}
          className="self-start flex-row items-center gap-2 py-3 mt-5"
        >
          <Ionicons name="help-circle-outline" size={19} color={theme.muted} />
          <Text className="text-muted text-base">{t("ux.tour")}</Text>
        </AppPressable>
      </ScrollView>
      {rescheduleTarget && Platform.OS === "ios" && (
        <Modal
          transparent
          visible
          animationType="slide"
          onRequestClose={() => !rescheduleBusy && setRescheduleTarget(null)}
        >
          <Pressable
            onPress={() => !rescheduleBusy && setRescheduleTarget(null)}
            className="flex-1 justify-end bg-black/50"
          >
            <Pressable
              onPress={() => {}}
              className="bg-card rounded-t-3xl p-5 pb-10"
            >
              <Text className="text-xl font-bold text-text">
                {t("doseCard.rescheduleTitle")}
              </Text>
              <Text className="text-base text-muted mt-2">
                {rescheduleTarget.medication.name}
              </Text>
              <DateTimePicker
                value={pickerDraft}
                mode="time"
                display="spinner"
                onChange={(_, date) => date && setPickerDraft(date)}
              />
              <AppPressable
                disabled={rescheduleBusy}
                onPress={() => confirmReschedule(pickerDraft)}
                className="bg-action rounded-2xl py-3.5 items-center"
              >
                <Text className="text-white text-base font-bold">
                  {t("common.confirm")}
                </Text>
              </AppPressable>
              <AppPressable
                disabled={rescheduleBusy}
                onPress={() => setRescheduleTarget(null)}
                className="py-3 items-center"
              >
                <Text className="text-muted text-base">
                  {t("common.cancel")}
                </Text>
              </AppPressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {rescheduleTarget && Platform.OS !== "ios" && (
        <DateTimePicker
          value={pickerDraft}
          mode="time"
          display="default"
          onChange={onNativeTime}
        />
      )}
      <CheckinModal
        visible={checkinVisible}
        onClose={() => setCheckinVisible(false)}
      />
      <SitePickerModal
        visible={siteDose !== null}
        suggested={siteSuggestion}
        current={siteDose?.injectionSite}
        onPick={saveSite}
        onClose={() => !siteBusy && setSiteDose(null)}
      />
    </SafeAreaView>
  );
}
