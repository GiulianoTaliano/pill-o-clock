import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { useAppStore } from "../../src/store";
import type { DoseLog, Medication } from "../../src/types";
import {
  getMedications,
  getSchedulesByMedication,
} from "../../src/db/database";
import { getActiveProfileId } from "../../src/services/profileStore";
import { useToast } from "../../src/context/ToastContext";
import { toDateString, formatTimeForDisplay } from "../../src/utils";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { InsightsCard } from "../../components/InsightsCard";
import { ProfileChip } from "../../components/ProfileChip";
import { EmptyState } from "../../components/EmptyState";
import { ReportPreparationModal } from "../../components/ReportPreparationModal";
import { AdBanner } from "../../components/AdBanner";

export default function HistoryScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const revertDose = useAppStore((s) => s.revertDose);
  const [recordMedications, setRecordMedications] = useState<Medication[]>([]);
  const [undoBusy, setUndoBusy] = useState(false);
  const undoGuard = useRef(false);
  const medications = useAppStore((s) => s.medications),
    getLogs = useAppStore((s) => s.getHistoryLogs),
    profile = useAppStore((s) => s.activeProfileId);
  const [logs, setLogs] = useState<DoseLog[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [mode, setMode] = useState<"week" | "month">("week"),
    [offset, setOffset] = useState(0),
    [day, setDay] = useState<string | null>(null);
  const [medId, setMedId] = useState<string | null>(null),
    [status, setStatus] = useState<string | null>(null),
    [detail, setDetail] = useState<DoseLog | null>(null),
    [report, setReport] = useState(false);
  const request = useRef(0);
  const monthStart = startOfMonth(subMonths(new Date(), offset));
  const monthEnd = addDays(startOfMonth(addMonths(monthStart, 1)), -1);
  const weekStart = startOfWeek(subWeeks(startOfDay(new Date()), offset), {
    weekStartsOn: 1,
  });
  const from = mode === "week" ? weekStart : monthStart,
    to = mode === "week" ? addDays(weekStart, 6) : monthEnd;
  const fromStr = toDateString(from),
    toStr = toDateString(to);
  const load = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    setError(false);
    try {
      const [result, allMedications] = await Promise.all([
        getLogs(fromStr, toStr),
        getMedications(),
      ]);
      if (token === request.current && getActiveProfileId() === profile) {
        setLogs(result);
        setRecordMedications(
          allMedications.filter((m) => (m.profileId ?? "default") === profile)
        );
      }
    } catch {
      if (token === request.current) setError(true);
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [fromStr, toStr, getLogs, profile]);
  useFocusEffect(
    useCallback(() => {
      setDay(null);
      setMedId(null);
      setDetail(null);
      void load();
      return () => {
        request.current++;
      };
    }, [load])
  );
  const medMap = new Map(
    [...recordMedications, ...medications].map((m) => [m.id, m])
  );
  const undo = async () => {
    if (undoGuard.current || !detail) return;
    const medication = medMap.get(detail.medicationId);
    if (!medication) return;
    undoGuard.current = true;
    setUndoBusy(true);
    try {
      const schedules = await getSchedulesByMedication(medication.id);
      await revertDose({
        medication,
        schedule: schedules.find((s) => s.id === detail.scheduleId) ?? {
          id: detail.scheduleId,
          medicationId: medication.id,
          time: detail.scheduledTime,
          days: [],
          isActive: false,
        },
        scheduledDate: detail.scheduledDate,
        scheduledTime: detail.scheduledTime,
        status: detail.status,
        doseLogId: detail.id,
      });
      setDetail(null);
      await load();
      showToast(t("ux.undoDone"), "info");
    } catch (error) {
      if (error instanceof Error && error.name === "SavedDoseError") {
        setDetail(null);
        await load();
        showToast(t("ux.savedWithWarning"), "error");
      } else Alert.alert(t("common.error"), t("uxHealth.deleteError"));
    } finally {
      undoGuard.current = false;
      setUndoBusy(false);
    }
  };
  const shown = useMemo(
    () =>
      logs
        .filter(
          (l) =>
            (!day || l.scheduledDate === day) &&
            (!medId || l.medicationId === medId) &&
            (!status || l.status === status)
        )
        .sort((a, b) =>
          `${b.scheduledDate} ${b.scheduledTime}`.localeCompare(
            `${a.scheduledDate} ${a.scheduledTime}`
          )
        ),
    [logs, day, medId, status]
  );
  const settled = logs.filter((l) => l.status !== "pending"),
    taken = settled.filter((l) => l.status === "taken").length,
    skipped = settled.filter((l) => l.status === "skipped").length,
    missed = settled.filter((l) => l.status === "missed").length;
  const rate = settled.length
    ? Math.round((taken / settled.length) * 100)
    : null;
  const dateLabel = (date: string) =>
    format(new Date(date + "T12:00"), "PPP", { locale: getDateLocale() });
  const rangeLabel =
    mode === "week"
      ? `${format(from, "d MMM", { locale: getDateLocale() })} – ${format(
          to,
          "d MMM yyyy",
          { locale: getDateLocale() }
        )}`
      : format(monthStart, "MMMM yyyy", { locale: getDateLocale() });
  const change = (newMode: "week" | "month") => {
    setMode(newMode);
    setOffset(0);
    setDay(null);
  };
  const header = (
    <>
      <View className="px-5 pt-4 pb-4 flex-row gap-3 items-center">
        <View className="flex-1">
          <Text className="text-xs uppercase tracking-widest text-muted">
            {t("history.title")}
          </Text>
          <Text className="text-2xl font-bold text-text mt-1">
            {t("history.adherenceLabel")}
          </Text>
        </View>
        <ProfileChip />
      </View>
      <View className="mx-5 flex-row bg-card border border-border rounded-2xl p-1 mb-3">
        {(["week", "month"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === v }}
            onPress={() => change(v)}
            className={`flex-1 min-h-[48px] items-center justify-center rounded-xl ${
              mode === v ? "bg-action" : ""
            }`}
          >
            <Text
              className={mode === v ? "text-white font-semibold" : "text-muted"}
            >
              {t(v === "week" ? "history.viewWeek" : "history.viewMonth")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View className="mx-5 flex-row gap-2 items-center mb-4">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("uxHealth.previousPeriod")}
          onPress={() => {
            setOffset((o) => o + 1);
            setDay(null);
          }}
          className="w-12 h-12 bg-card border border-border rounded-2xl items-center justify-center"
        >
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
        </TouchableOpacity>
        <Text className="flex-1 text-center font-semibold text-text">
          {rangeLabel}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("uxHealth.nextPeriod")}
          accessibilityState={{ disabled: offset === 0 }}
          disabled={offset === 0}
          onPress={() => {
            setOffset((o) => Math.max(0, o - 1));
            setDay(null);
          }}
          className={`w-12 h-12 bg-card border border-border rounded-2xl items-center justify-center ${
            offset === 0 ? "opacity-40" : ""
          }`}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>
      {!!offset && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setOffset(0);
            setDay(null);
          }}
          className="mx-5 min-h-[48px] items-center justify-center mb-3"
        >
          <Text className="text-primary font-semibold">
            {t("calendar.today")}
          </Text>
        </TouchableOpacity>
      )}
      {loading ? (
        <View className="py-8 items-center">
          <ActivityIndicator color={theme.primary} />
          <Text className="text-muted mt-3">{t("uxHealth.loading")}</Text>
        </View>
      ) : error ? (
        <View className="mx-5">
          <EmptyState
            icon="cloud-offline-outline"
            title={t("uxHealth.loadError")}
            actionLabel={t("uxHealth.retry")}
            onAction={() => void load()}
          />
        </View>
      ) : (
        <>
          <View className="mx-5 bg-card border border-border rounded-3xl p-5 mb-4">
            <Text className="text-xs text-muted uppercase tracking-widest">
              {t("history.adherenceLabel")}
            </Text>
            <Text className="text-5xl font-bold text-text mt-3">
              {rate == null ? "—" : `${rate}%`}
            </Text>
            <Text className="text-sm text-muted mt-3 leading-5">
              {taken}/{settled.length} · {t("uxHealth.statusMeaning")}
            </Text>
            <View className="flex-row flex-wrap gap-4 mt-4">
              {[
                { label: t("history.taken"), value: taken },
                { label: t("status.skipped"), value: skipped },
                { label: t("status.missed"), value: missed },
              ].map((s) => (
                <View key={s.label}>
                  <Text className="text-xl font-bold text-text">{s.value}</Text>
                  <Text className="text-xs text-muted">{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setReport(true)}
            className="mx-5 bg-action min-h-[52px] rounded-2xl flex-row items-center justify-center gap-2 mb-5"
          >
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text className="text-white font-bold">
              {t("uxHealth.reportPrepare")}
            </Text>
          </TouchableOpacity>
          <InsightsCard />
          {mode === "month" && (
            <View className="mx-5 bg-card border border-border rounded-2xl p-3 mb-5">
              <View className="flex-row mb-2">
                {(
                  t("calendar.dayHeaders", { returnObjects: true }) as string[]
                ).map((h, i) => (
                  <Text
                    key={i}
                    className="flex-1 text-center text-xs text-muted"
                  >
                    {h}
                  </Text>
                ))}
              </View>
              {(() => {
                const pad = (monthStart.getDay() + 6) % 7;
                const cells: (Date | null)[] = [
                  ...Array(pad).fill(null),
                  ...eachDayOfInterval({ start: monthStart, end: monthEnd }),
                ];
                while (cells.length % 7) cells.push(null);
                return Array.from(
                  { length: Math.ceil((getDaysInMonth(monthStart) + pad) / 7) },
                  (_, row) => (
                    <View key={row} className="flex-row mb-1">
                      {cells.slice(row * 7, row * 7 + 7).map((d, col) => {
                        if (!d) return <View key={col} className="flex-1" />;
                        const ds = toDateString(d),
                          records = logs.filter(
                            (l) =>
                              l.scheduledDate === ds && l.status !== "pending"
                          ),
                          n = records.filter(
                            (l) => l.status === "taken"
                          ).length;
                        const pct = records.length ? n / records.length : null;
                        const badge =
                          pct == null
                            ? null
                            : pct === 1
                            ? theme.statusBadge.taken
                            : pct >= 0.5
                            ? theme.statusBadge.pending
                            : theme.statusBadge.skipped;
                        const bg = badge?.bg ?? theme.cardAlt;
                        const foreground = badge?.color ?? theme.secondaryText;
                        return (
                          <TouchableOpacity
                            key={col}
                            accessibilityRole="button"
                            accessibilityState={{ selected: day === ds }}
                            accessibilityLabel={`${dateLabel(ds)}, ${
                              pct == null
                                ? t("uxHealth.neutralDay")
                                : `${n}/${records.length}, ${Math.round(
                                    pct * 100
                                  )}%`
                            }`}
                            onPress={() =>
                              setDay((current) => (current === ds ? null : ds))
                            }
                            style={{ backgroundColor: bg }}
                            className={`flex-1 min-h-[48px] rounded-xl items-center justify-center mx-0.5 ${
                              day === ds ? "border-2 border-primary" : ""
                            }`}
                          >
                            <Text
                              style={{
                                color: foreground,
                              }}
                              className="font-semibold"
                            >
                              {d.getDate()}
                            </Text>
                            <Text
                              style={{
                                color: foreground,
                              }}
                              className="text-[10px]"
                            >
                              {pct == null ? "—" : `${n}/${records.length}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )
                );
              })()}
              <Text className="text-xs text-muted mt-3">
                {t("uxHealth.statusMeaning")}
              </Text>
            </View>
          )}
          <View className="px-5 mb-4">
            <Text
              accessibilityRole="header"
              className="text-lg font-bold text-text"
            >
              {day ? dateLabel(day) : t("uxHealth.allRecords")}
            </Text>
            {day && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setDay(null)}
                className="min-h-[48px] justify-center"
              >
                <Text className="text-primary">{t("uxHealth.allRecords")}</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 8,
              paddingBottom: 12,
            }}
          >
            {[
              null,
              ...Array.from(new Set(logs.map((l) => l.medicationId))),
            ].map((id) => (
              <TouchableOpacity
                key={id ?? "all"}
                accessibilityRole="button"
                accessibilityState={{ selected: medId === id }}
                onPress={() => setMedId(id)}
                className={`min-h-[48px] px-4 rounded-xl justify-center border ${
                  medId === id
                    ? "bg-action border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Text className={medId === id ? "text-white" : "text-muted"}>
                  {id
                    ? medMap.get(id)?.name ?? t("uxHealth.unknownMedication")
                    : t("medications.title")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 8,
              paddingBottom: 16,
            }}
          >
            {[null, "taken", "skipped", "missed", "pending"].map((s) => (
              <TouchableOpacity
                key={s ?? "all"}
                accessibilityRole="button"
                accessibilityState={{ selected: status === s }}
                onPress={() => setStatus(s)}
                className={`min-h-[48px] px-4 rounded-xl justify-center border ${
                  status === s
                    ? "bg-action border-primary"
                    : "bg-card border-border"
                }`}
              >
                <Text className={status === s ? "text-white" : "text-muted"}>
                  {s ? t(`status.${s}`) : t("uxHealth.allRecords")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </>
  );
  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={loading || error ? [] : shown}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item: l }) => {
          const badge = theme.statusBadge[l.status];
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("uxHealth.doseDetails", {
                name:
                  medMap.get(l.medicationId)?.name ??
                  t("uxHealth.unknownMedication"),
                date: dateLabel(l.scheduledDate),
                time: formatTimeForDisplay(l.scheduledTime),
                status: t(`status.${l.status}`),
              })}
              onPress={() => setDetail(l)}
              className="mx-5 bg-card border border-border rounded-2xl p-4 mb-3"
            >
              <View className="flex-row items-start gap-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-text">
                    {medMap.get(l.medicationId)?.name ??
                      t("uxHealth.unknownMedication")}
                  </Text>
                  <Text className="text-sm text-muted mt-1">
                    {dateLabel(l.scheduledDate)} ·{" "}
                    {formatTimeForDisplay(l.scheduledTime)}
                  </Text>
                </View>
                <Text
                  style={{ color: badge.color, backgroundColor: badge.bg }}
                  className="px-2 py-1 rounded-lg text-xs font-semibold"
                >
                  {t(`status.${l.status}`)}
                </Text>
              </View>
              {l.notes && (
                <Text className="text-sm text-muted mt-3" numberOfLines={2}>
                  {l.notes}
                </Text>
              )}
              <Text className="text-primary text-xs mt-3">
                {t("uxHealth.details")} ›
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <View className="mx-5">
              <EmptyState
                icon="calendar-outline"
                title={t("uxHealth.noResults")}
              />
            </View>
          ) : null
        }
      />
      <Modal
        visible={!!detail}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!undoGuard.current) setDetail(null);
        }}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            accessibilityViewIsModal
            className="bg-background rounded-t-3xl max-h-[90%]"
          >
            <ScrollView
              contentContainerStyle={{
                padding: 24,
                paddingBottom: Math.max(insets.bottom, 20) + 20,
              }}
            >
              <Text
                accessibilityRole="header"
                className="text-2xl font-bold text-text"
              >
                {detail
                  ? medMap.get(detail.medicationId)?.name ??
                    t("uxHealth.unknownMedication")
                  : ""}
              </Text>
              {detail && (
                <>
                  <Text className="text-base text-muted mt-3">
                    {dateLabel(detail.scheduledDate)} ·{" "}
                    {formatTimeForDisplay(detail.scheduledTime)}
                  </Text>
                  <Text className="text-lg font-semibold text-text mt-4">
                    {t(`status.${detail.status}`)}
                  </Text>
                  {detail.takenAt && (
                    <Text className="text-base text-muted mt-3">
                      {t("uxHealth.takenAt")}{" "}
                      {format(new Date(detail.takenAt), "Pp", {
                        locale: getDateLocale(),
                      })}
                    </Text>
                  )}
                  {detail.notes && (
                    <Text className="text-base text-text leading-6 mt-4">
                      {detail.notes}
                    </Text>
                  )}
                  {detail.skipReason && (
                    <Text className="text-base text-muted mt-4">
                      {t(`doseCard.skipReason_${detail.skipReason}`)}
                    </Text>
                  )}
                  {detail.injectionSite && (
                    <Text className="text-base text-muted mt-4">
                      {t(`sites.${detail.injectionSite}`)}
                    </Text>
                  )}
                </>
              )}
              {detail &&
                medMap.has(detail.medicationId) &&
                detail.status !== "pending" && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ busy: undoBusy, disabled: undoBusy }}
                    disabled={undoBusy}
                    onPress={() =>
                      // A past record is a confirmed fact: removing it turns the
                      // dose into "missed" on the next launch, so ask first.
                      Alert.alert(
                        t("uxHealth.undoConfirmTitle"),
                        t("uxHealth.undoConfirmMessage"),
                        [
                          { text: t("common.cancel"), style: "cancel" },
                          {
                            text: t("uxHealth.undo"),
                            style: "destructive",
                            onPress: () => void undo(),
                          },
                        ]
                      )
                    }
                    className="min-h-[52px] rounded-2xl border border-border p-4 items-center mt-6"
                  >
                    <Text className="text-primary font-semibold">
                      {undoBusy ? t("common.saving") : t("uxHealth.undo")}
                    </Text>
                  </TouchableOpacity>
                )}
              <TouchableOpacity
                accessibilityRole="button"
                disabled={undoBusy}
                onPress={() => setDetail(null)}
                className="bg-action min-h-[52px] rounded-2xl p-4 items-center mt-6"
              >
                <Text className="text-white font-bold">
                  {t("common.close")}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ReportPreparationModal
        visible={report}
        initialFrom={fromStr}
        initialTo={toStr}
        onClose={() => setReport(false)}
      />
      <AdBanner screen="history" />
    </SafeAreaView>
  );
}
