import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { useAppStore } from "../../src/store";
import { MedicationCard } from "../../components/MedicationCard";
import { EmptyState } from "../../components/EmptyState";
import { useTranslation } from "../../src/i18n";
import { prnWarningMessage } from "../../src/services/prnLimits";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { useToast } from "../../src/context/ToastContext";
import { reviewMedicationBeforeSave } from "../../src/services/medicationReview";
import type { Medication } from "../../src/types";
import {
  SavedMedicationError,
  SavedDoseError,
} from "../../src/store/slices/medications";

export default function MedicationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { showToast } = useToast();
  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const todayLogs = useAppStore((s) => s.todayLogs);
  const deleteMedication = useAppStore((s) => s.deleteMedication);
  const toggleActive = useAppStore((s) => s.toggleMedicationActive);
  const archiveMedication = useAppStore((s) => s.archiveMedication);
  const unarchiveMedication = useAppStore((s) => s.unarchiveMedication);
  const logPRNDose = useAppStore((s) => s.logPRNDose);
  const loadAll = useAppStore((s) => s.loadAll);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "active" | "paused" | "archived"
  >("all");
  const [archiveTarget, setArchiveTarget] = useState<Medication | null>(null);
  const [reason, setReason] = useState("finished");
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = useRef(false);
  const operation = async (
    med: Medication,
    action: () => Promise<unknown>,
    success?: string
  ) => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(med.id);
    try {
      await action();
      if (success) showToast(t(success), "success");
    } catch (error) {
      showToast(
        t(
          error instanceof SavedMedicationError
            ? "uxMedication.notificationsPending"
            : error instanceof SavedDoseError
            ? "uxMedication.registeredWarning"
            : "uxMedication.operationError"
        ),
        "error"
      );
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } catch {
      showToast(t("uxMedication.operationError"), "error");
    } finally {
      setRefreshing(false);
    }
  };
  const handleDelete = (med: Medication) =>
    Alert.alert(
      t("medications.deleteTitle"),
      t("uxMedication.deleteHint", { name: med.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => operation(med, () => deleteMedication(med.id)),
        },
      ]
    );
  const handleToggle = (med: Medication, active: boolean) =>
    operation(med, async () => {
      if (
        active &&
        !(await reviewMedicationBeforeSave(t, med, medications, med.id))
      )
        return;
      await toggleActive(med.id, active);
      showToast(
        t(active ? "uxMedication.activeSuccess" : "uxMedication.pausedSuccess"),
        "success"
      );
    });
  const handleRestore = (med: Medication) =>
    operation(med, async () => {
      if (!(await reviewMedicationBeforeSave(t, med, medications, med.id)))
        return;
      await unarchiveMedication(med.id);
      showToast(t("uxMedication.restored"), "success");
    });
  const handlePRN = (med: Medication) =>
    Alert.alert(
      t("medicationCard.logPRNTitle"),
      `${med.name} · ${med.dosageAmount} ${med.dosageUnit}\n${t(
        "medicationCard.logPRNConfirm",
        { name: med.name }
      )}`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("medicationCard.logPRNConfirmBtn"),
          onPress: () =>
            operation(med, async () => {
              const check = await logPRNDose(med);
              if (check?.blocked) {
                Alert.alert(
                  t("prn.limitTitle"),
                  prnWarningMessage(t, med, check),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("prn.logAnyway"),
                      style: "destructive",
                      onPress: () =>
                        operation(
                          med,
                          () => logPRNDose(med, { force: true }),
                          "uxMedication.registered"
                        ),
                    },
                  ]
                );
              } else showToast(t("uxMedication.registered"), "success");
            }),
        },
      ]
    );
  const normalized = query.trim().toLocaleLowerCase();
  const visible = medications.filter(
    (med) =>
      med.name.toLocaleLowerCase().includes(normalized) &&
      (filter === "all" ||
        (filter === "active" && med.isActive && !med.archivedAt) ||
        (filter === "paused" && !med.isActive && !med.archivedAt) ||
        (filter === "archived" && !!med.archivedAt))
  );
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-2xl font-black text-text"
          >
            {t("medications.title")}
          </Text>
          <Text className="text-base text-muted">
            {t("medications.subtitle", { count: medications.length })}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("form.addButton")}
          onPress={() => router.push("/medication/new")}
          className="w-12 h-12 rounded-xl bg-action items-center justify-center"
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
      <View className="px-5 pb-2">
        <TextInput
          accessibilityLabel={t("uxMedication.search")}
          value={query}
          onChangeText={setQuery}
          placeholder={t("uxMedication.search")}
          placeholderTextColor={theme.muted}
          clearButtonMode="while-editing"
          className="text-base text-text bg-card border border-border rounded-xl px-4 py-3"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
        >
          {(["all", "active", "paused", "archived"] as const).map((value) => (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === value }}
              onPress={() => setFilter(value)}
              className={`mr-2 px-4 py-3 rounded-xl border ${
                filter === value
                  ? "bg-action border-primary"
                  : "bg-card border-border"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  filter === value ? "text-white" : "text-text"
                }`}
              >
                {t(`uxMedication.${value}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {visible.length === 0 ? (
          <View>
            <EmptyState
              illustration="noMeds"
              title={t(
                medications.length
                  ? "uxMedication.noResults"
                  : "medications.noMeds"
              )}
              subtitle={t(
                medications.length
                  ? "uxMedication.search"
                  : "medications.noMedsSubtitle"
              )}
            />
            {!medications.length && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => router.push("/medication/new")}
                className="bg-action rounded-xl py-4 items-center"
              >
                <Text className="text-base font-bold text-white">
                  {t("form.addButton")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          visible.map((med) => (
            <MedicationCard
              key={med.id}
              medication={med}
              schedules={schedules.filter(
                (item) => item.medicationId === med.id
              )}
              todayLogs={todayLogs}
              disabled={busyId === med.id}
              onEdit={() => router.push(`/medication/${med.id}`)}
              onDelete={() => handleDelete(med)}
              onToggleActive={(active) =>
                med.archivedAt ? handleRestore(med) : handleToggle(med, active)
              }
              onArchive={
                med.archivedAt
                  ? undefined
                  : () => {
                      setReason("finished");
                      setArchiveTarget(med);
                    }
              }
              onRestore={med.archivedAt ? () => handleRestore(med) : undefined}
              onLogPRN={() => handlePRN(med)}
            />
          ))
        )}
      </ScrollView>
      <Modal
        visible={!!archiveTarget}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy.current) setArchiveTarget(null);
        }}
      >
        <Pressable
          onPress={() => {
            if (!busy.current) setArchiveTarget(null);
          }}
          className="flex-1 bg-black/50 justify-end"
        >
          <Pressable
            onPress={() => {}}
            className="bg-card rounded-t-3xl px-5 pt-6 pb-10"
          >
            <Text
              accessibilityRole="header"
              className="text-xl font-bold text-text"
            >
              {t("uxMedication.archive")}
            </Text>
            <Text className="text-lg text-text mt-2">
              {archiveTarget?.name}
            </Text>
            <Text className="text-base text-muted mt-2 mb-4">
              {t("uxMedication.archiveHint")}
            </Text>
            {(["finished", "doctor", "side_effects", "other"] as const).map(
              (value) => (
                <TouchableOpacity
                  key={value}
                  disabled={!!busyId}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reason === value }}
                  onPress={() => setReason(value)}
                  className="py-4 flex-row items-center gap-3 border-b border-border"
                >
                  <Ionicons
                    name={
                      reason === value ? "radio-button-on" : "radio-button-off"
                    }
                    size={22}
                    color={theme.primary}
                  />
                  <Text className="text-base text-text flex-1">
                    {t(`archive.reason_${value}`)}
                  </Text>
                </TouchableOpacity>
              )
            )}
            <View className="flex-row gap-3 mt-5">
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!!busyId}
                onPress={() => setArchiveTarget(null)}
                className="flex-1 py-4 items-center rounded-xl border border-border"
              >
                <Text className="text-base font-semibold text-text">
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!!busyId}
                onPress={() => {
                  const target = archiveTarget;
                  if (target)
                    void operation(
                      target,
                      async () => {
                        await archiveMedication(target.id, reason);
                        setArchiveTarget(null);
                      },
                      "uxMedication.archivedSuccess"
                    );
                }}
                className="flex-1 bg-action py-4 items-center rounded-xl"
              >
                <Text className="text-base font-bold text-white">
                  {t(busyId ? "common.saving" : "uxMedication.archive")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
