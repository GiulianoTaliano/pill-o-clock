import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform, Linking, Switch } from "react-native";
import { useToast } from "../../src/context/ToastContext";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useCallback } from "react";
import { AppState as RNAppState } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { useTranslation, changeLanguage } from "../../src/i18n";
import { useAppStore, ThemeMode } from "../../src/store";
import { exportBackup, importBackup, BackupCancelledError, BackupFormatError } from "../../src/services/backup";
import { generateAndShareReport } from "../../src/services/pdfReport";
import { generateAndShareCaregiverSnapshot } from "../../src/services/caregiverSnapshot";
import { generateAndShareFhirBundle } from "../../src/services/fhirExport";
import { checkFullScreenIntentPermission, requestFullScreenIntentPermission, getAlarmSound, stopSoundPreview } from "expo-alarm";
import type { AlarmSound } from "expo-alarm";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { AlarmSoundPicker } from "../../components/AlarmSoundPicker";
import { SNOOZE_OPTIONS, getDefaultSnoozeMinutes, setDefaultSnoozeMinutes } from "../../src/services/snoozeSettings";
import { refreshDoseReminderCategory } from "../../src/services/notifications";
import * as LocalAuthentication from "expo-local-authentication";
import {
  isAppLockSupported,
  isAppLockEnabled,
  isBiometricPreferred,
  setBiometricPreferred,
  enableAppLock,
  disableAppLock,
  changePin,
} from "../../src/services/appLock";
import { PinModal } from "../../components/PinModal";
import { isHealthSyncSupported, isHealthSyncEnabled, enableHealthSync, disableHealthSync } from "../../src/services/healthSync";
import { ProfileModal } from "../../components/ProfileModal";
import { MEDICATION_COLORS } from "../../src/utils";
import type { Profile } from "../../src/types";

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ title, danger = false }: { title: string; danger?: boolean }) {
  return (
    <View className="px-5 pt-6 pb-1">
      <Text
        className="text-xs font-semibold uppercase tracking-widest text-muted"
        style={danger ? { color: "#dc2626" } : undefined}
      >
        {title}
      </Text>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-border mx-5" />;
}

interface RowProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  loading?: boolean;
  danger?: boolean;
  chevron?: boolean;
}

function SettingRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  loading = false,
  danger = false,
  chevron,
}: RowProps) {
  const theme = useAppTheme();
  const resolvedIconColor = iconColor ?? theme.primary;
  const isInteractive = !!onPress;
  const showChevron = chevron ?? (isInteractive && !value);

  const inner = (
    <View className="flex-row items-center px-5 py-4 bg-card" style={{ minHeight: 60 }}>
      {/* icon pill */}
      <View
        className="w-11 h-11 rounded-xl items-center justify-center mr-4"
        style={{ backgroundColor: resolvedIconColor + "18" }}
      >
        <Ionicons name={icon} size={20} color={resolvedIconColor} />
      </View>

      {/* text */}
      <View className="flex-1">
        <Text
          className="text-sm font-semibold text-text"
          style={danger ? { color: theme.danger } : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-muted mt-0.5">{subtitle}</Text>
        ) : null}
      </View>

      {/* right side */}
      {loading ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : value ? (
        <Text className="text-sm text-muted">{value}</Text>
      ) : showChevron ? (
        <Ionicons name="chevron-forward" size={16} color={theme.muted} />
      ) : null}
    </View>
  );

  if (!isInteractive) return inner;

  return (
    <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.7}>
      {inner}
    </TouchableOpacity>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const resetAllData = useAppStore((s) => s.resetAllData);
  const loadAll = useAppStore((s) => s.loadAll);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const seniorMode = useAppStore((s) => s.seniorMode);
  const setSeniorMode = useAppStore((s) => s.setSeniorMode);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingSnapshot, setGeneratingSnapshot] = useState(false);
  const [exportingFhir, setExportingFhir] = useState(false);
  const { showToast } = useToast();

  // Multi-profile (F2)
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const switchProfile = useAppStore((s) => s.switchProfile);
  const addProfile = useAppStore((s) => s.addProfile);
  const renameProfile = useAppStore((s) => s.renameProfile);
  const removeProfile = useAppStore((s) => s.removeProfile);
  const loadProfiles = useAppStore((s) => s.loadProfiles);
  /** null = closed; "new" = create mode; otherwise the profile being edited. */
  const [profileModal, setProfileModal] = useState<"new" | Profile | null>(null);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profileDisplayName = (p: Profile) => p.name || t("profiles.me");

  async function handleProfileSave(name: string, color: string, contact: { name: string; phone: string }) {
    const editing = profileModal;
    setProfileModal(null);
    if (editing === "new") {
      const p = await addProfile(name, color);
      if (contact.name || contact.phone) {
        await renameProfile(p.id, name, color, contact);
      }
      await switchProfile(p.id);
      showToast(t("profiles.switchedTo", { name: name || t("profiles.me") }), "success");
    } else if (editing) {
      await renameProfile(editing.id, name, color, contact);
    }
  }

  async function handleProfileDelete(id: string) {
    setProfileModal(null);
    await removeProfile(id);
    showToast(t("profiles.deleted"), "success");
  }

  // Full-screen intent permission (Android 14+ only)
  const [hasFullScreenPerm, setHasFullScreenPerm] = useState<boolean | null>(null);

  // Alarm sound selection (Android only)
  const [alarmSoundExpanded, setAlarmSoundExpanded] = useState(false);
  const [currentSoundTitle, setCurrentSoundTitle] = useState<string>("");

  // Default snooze interval (F1: configurable snooze)
  const [snoozeMinutes, setSnoozeMinutesState] = useState(getDefaultSnoozeMinutes);

  const handleSnoozeMinutes = (min: number) => {
    if (min === snoozeMinutes) return;
    Haptics.selectionAsync();
    setSnoozeMinutesState(min);
    setDefaultSnoozeMinutes(min);
    // Fire-and-forget: refresh the notification quick-action label so the
    // ⏰ button shows the new interval on future reminders.
    refreshDoseReminderCategory().catch(() => {});
  };

  // App lock (F1)
  const [appLockOn, setAppLockOn] = useState(isAppLockEnabled);
  const [biometricOn, setBiometricOn] = useState(isBiometricPreferred);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [pinModal, setPinModal] = useState<null | { mode: "setup" | "verify" | "change"; intent: "enable" | "disable" | "change" }>(null);

  useEffect(() => {
    if (!isAppLockSupported()) return;
    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
      .then(([hw, enrolled]) => setBiometricAvail(hw && enrolled))
      .catch(() => setBiometricAvail(false));
  }, []);

  const handleAppLockToggle = () => {
    Haptics.selectionAsync();
    // Enabling asks for a new PIN; disabling requires the current PIN so a
    // passerby can't just switch the protection off.
    setPinModal(appLockOn ? { mode: "verify", intent: "disable" } : { mode: "setup", intent: "enable" });
  };

  const handleBiometricToggle = (on: boolean) => {
    Haptics.selectionAsync();
    setBiometricOn(on);
    setBiometricPreferred(on);
  };

  // Health Connect sync (F2)
  const [healthSyncOn, setHealthSyncOn] = useState(isHealthSyncEnabled);

  const handleHealthSyncToggle = async (on: boolean) => {
    Haptics.selectionAsync();
    if (!on) {
      disableHealthSync();
      setHealthSyncOn(false);
      return;
    }
    // Optimistic flip while the permission sheet is up; revert on refusal.
    setHealthSyncOn(true);
    const granted = await enableHealthSync();
    if (!granted) {
      setHealthSyncOn(false);
      showToast(t("settings.healthSyncDenied"), "error");
    } else {
      showToast(t("settings.healthSyncEnabled"), "success");
    }
  };

  const handlePinSuccess = async (pin: string) => {
    const intent = pinModal?.intent;
    setPinModal(null);
    try {
      if (intent === "enable") {
        await enableAppLock(pin);
        setAppLockOn(true);
        showToast(t("appLock.enabledToast"), "success");
      } else if (intent === "disable") {
        await disableAppLock();
        setAppLockOn(false);
        showToast(t("appLock.disabledToast"), "success");
      } else if (intent === "change") {
        await changePin(pin);
        showToast(t("appLock.pinChangedToast"), "success");
      }
    } catch {
      showToast(t("settings.exportErrorGeneric"), "error");
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;

      // Check on mount/focus
      checkFullScreenIntentPermission().then(setHasFullScreenPerm).catch(() => setHasFullScreenPerm(true));

      // Load current alarm sound name
      getAlarmSound()
        .then((s) => setCurrentSoundTitle(s.title || ""))
        .catch(() => {});

      // Re-check when the user returns from system Settings
      const sub = RNAppState.addEventListener("change", (nextState) => {
        if (nextState === "active") {
          checkFullScreenIntentPermission().then(setHasFullScreenPerm).catch(() => {});
        }
      });

      return () => {
        sub.remove();
        // Stop any sound preview when leaving settings
        stopSoundPreview().catch(() => {});
      };
    }, [])
  );

  // ─── Handlers ──────────────────────────────────────────────────────────

  async function handleFullScreenPermission() {
    Haptics.selectionAsync();
    await requestFullScreenIntentPermission();
  }

  function handleToggleAlarmSound() {
    Haptics.selectionAsync();
    if (alarmSoundExpanded) {
      stopSoundPreview().catch(() => {});
    }
    setAlarmSoundExpanded((prev) => !prev);
  }

  function handleSoundChange(sound: AlarmSound) {
    setCurrentSoundTitle(sound.title || "");
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportBackup();
      showToast(t("settings.exportSuccess"), "success");
    } catch (e) {
      if (e instanceof BackupCancelledError) return;
      showToast(t("settings.exportErrorGeneric"), "error");
    } finally {
      setExporting(false);
    }
  }

  function handleImport() {
    Alert.alert(
      t("settings.importModeTitle"),
      t("settings.importModeMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.importModeMerge"),
          onPress: () => runImport("merge"),
        },
        {
          text: t("settings.importModeReplace"),
          style: "destructive",
          onPress: () => runImport("replace"),
        },
      ]
    );
  }

  async function runImport(mode: "replace" | "merge") {
    setImporting(true);
    try {
      const { count } = await importBackup(mode);
      await loadAll();
      showToast(t("settings.importSuccessMsg", { count }), "success");
    } catch (e) {
      if (e instanceof BackupCancelledError) return;
      const msg =
        e instanceof BackupFormatError
          ? t("settings.importErrorFormat")
          : t("settings.importErrorGeneric");
      showToast(msg, "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    try {
      await generateAndShareReport();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t("report.errorTitle"), msg || t("report.errorMsg"));
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleFhirExport() {
    setExportingFhir(true);
    try {
      await generateAndShareFhirBundle();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t("report.errorTitle"), msg || t("report.errorMsg"));
    } finally {
      setExportingFhir(false);
    }
  }

  async function handleCaregiverSnapshot() {
    setGeneratingSnapshot(true);
    try {
      await generateAndShareCaregiverSnapshot();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t("report.errorTitle"), msg || t("report.errorMsg"));
    } finally {
      setGeneratingSnapshot(false);
    }
  }

  function handleClearData() {
    Alert.alert(
      t("settings.clearDataConfirmTitle"),
      t("settings.clearDataConfirmMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.clearDataConfirmButton"),
          style: "destructive",
          onPress: () => {
            // Second confirmation to prevent accidental data loss
            Alert.alert(
              t("settings.clearDataFinalTitle"),
              t("settings.clearDataFinalMsg"),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("settings.clearDataFinalButton"),
                  style: "destructive",
                  onPress: async () => {
                    await resetAllData();
                    await loadAll();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  function handleLanguage(lang: "es" | "en") {
    Haptics.selectionAsync();
    changeLanguage(lang);
  }

  function handleTheme(mode: ThemeMode) {
    Haptics.selectionAsync();
    setThemeMode(mode);
  }

  const currentLang = i18n.language.startsWith("es") ? "es" : "en";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-text">{t("settings.title")}</Text>
        </View>

        {/* ─── Permissions (Android only) ─── */}
        {Platform.OS === "android" && (
          <>
            <SectionHeader title={t("settings.sectionPermissions")} />
            <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              <SettingRow
                icon="notifications-outline"
                iconColor={hasFullScreenPerm === false ? theme.warning : theme.primary}
                title={t("settings.fullScreenPermission")}
                subtitle={t("settings.fullScreenPermissionSubtitle")}
                value={
                  hasFullScreenPerm === null
                    ? undefined
                    : hasFullScreenPerm
                    ? t("settings.fullScreenPermissionGranted")
                    : t("settings.fullScreenPermissionRequired")
                }
                onPress={hasFullScreenPerm === false ? handleFullScreenPermission : undefined}
                loading={hasFullScreenPerm === null}
                chevron={hasFullScreenPerm === false}
              />
            </View>
          </>
        )}

        {/* ─── Alarm sound (Android only) ─── */}
        {Platform.OS === "android" && (
          <>
            <SectionHeader title={t("settings.sectionAlarmSound")} />
            <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              <SettingRow
                icon="musical-notes-outline"
                iconColor="#8b5cf6"
                title={t("settings.alarmSound")}
                subtitle={t("settings.alarmSoundSubtitle")}
                value={currentSoundTitle || t("settings.alarmSoundDefault")}
                onPress={handleToggleAlarmSound}
                chevron
              />
            </View>
            {alarmSoundExpanded && (
              <View className="mx-5 mt-2">
                <AlarmSoundPicker maxHeight={300} onSoundChange={handleSoundChange} />
              </View>
            )}
          </>
        )}

        {/* ─── Snooze default (F1: configurable snooze) ─── */}
        <SectionHeader title={t("settings.sectionSnooze")} />
        <View className="mx-5 rounded-2xl overflow-hidden bg-card px-4 py-3.5" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <View className="flex-row items-center gap-3 mb-3">
            <Ionicons name="alarm-outline" size={20} color="#f59e0b" />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text">{t("settings.snoozeDefaultTitle")}</Text>
              <Text className="text-xs text-muted mt-0.5 leading-4">{t("settings.snoozeDefaultSubtitle")}</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {SNOOZE_OPTIONS.map((min) => {
              const selected = min === snoozeMinutes;
              return (
                <TouchableOpacity
                  key={min}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t("settings.snoozeOptionA11y", { minutes: min })}
                  onPress={() => handleSnoozeMinutes(min)}
                  className={`rounded-xl px-3.5 py-2 border ${
                    selected
                      ? "bg-amber-500 border-amber-600 dark:bg-amber-600 dark:border-amber-500"
                      : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                  }`}
                >
                  <Text className={`font-bold text-sm ${selected ? "text-white" : "text-amber-700 dark:text-amber-300"}`}>
                    {min} min
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ─── Security (F1: app lock) ─── */}
        {isAppLockSupported() && (
          <>
            <SectionHeader title={t("settings.sectionSecurity")} />
            <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
              <View className="flex-row items-center px-4 py-3.5 gap-3">
                <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-text">{t("settings.appLockTitle")}</Text>
                  <Text className="text-xs text-muted mt-0.5 leading-4">{t("settings.appLockSubtitle")}</Text>
                </View>
                <Switch
                  value={appLockOn}
                  onValueChange={handleAppLockToggle}
                  trackColor={{ false: undefined, true: theme.primary }}
                  accessibilityLabel={t("settings.appLockTitle")}
                />
              </View>
              {appLockOn && (
                <>
                  {biometricAvail && (
                    <>
                      <Divider />
                      <View className="flex-row items-center px-4 py-3.5 gap-3">
                        <Ionicons name="finger-print" size={20} color={theme.accent} />
                        <View className="flex-1">
                          <Text className="text-[15px] font-semibold text-text">{t("settings.appLockBiometric")}</Text>
                          <Text className="text-xs text-muted mt-0.5 leading-4">{t("settings.appLockBiometricSubtitle")}</Text>
                        </View>
                        <Switch
                          value={biometricOn}
                          onValueChange={handleBiometricToggle}
                          trackColor={{ false: undefined, true: theme.primary }}
                          accessibilityLabel={t("settings.appLockBiometric")}
                        />
                      </View>
                    </>
                  )}
                  <Divider />
                  <SettingRow
                    icon="key-outline"
                    title={t("settings.appLockChangePin")}
                    subtitle={t("settings.appLockChangePinSubtitle")}
                    onPress={() => setPinModal({ mode: "change", intent: "change" })}
                  />
                </>
              )}
            </View>
            <PinModal
              visible={pinModal !== null}
              mode={pinModal?.mode ?? "setup"}
              onClose={() => setPinModal(null)}
              onSuccess={handlePinSuccess}
            />
          </>
        )}

        {/* ─── Your data ─── */}
        {/* ─── Profiles (F2 multi-profile) ─── */}
        <SectionHeader title={t("profiles.sectionTitle")} />
        {/* Safety honesty note: alarms ring for every profile, always. */}
        <View className="mx-5 mb-2 flex-row items-start gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5">
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} style={{ marginTop: 1 }} />
          <Text className="text-xs text-muted flex-1 leading-5">{t("profiles.alarmsNote")}</Text>
        </View>
        <View className="mx-5 mb-2 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          {profiles.map((p, idx) => (
            <View key={p.id}>
              {idx > 0 && <Divider />}
              <View className="flex-row items-center px-4 py-3">
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={profileDisplayName(p)}
                  onPress={() => { Haptics.selectionAsync(); switchProfile(p.id); }}
                  className="flex-1 flex-row items-center gap-3"
                >
                  <Ionicons
                    name={p.id === activeProfileId ? "radio-button-on" : "radio-button-off-outline"}
                    size={20}
                    color={p.id === activeProfileId ? theme.primary : theme.muted}
                  />
                  <View
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: MEDICATION_COLORS[p.color]?.bg ?? "#3b82f6" }}
                  />
                  <Text className="text-[15px] font-semibold text-text flex-1" numberOfLines={1}>
                    {profileDisplayName(p)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("profiles.editTitle")}
                  onPress={() => setProfileModal(p)}
                  className="p-2"
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.muted} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Divider />
          <SettingRow
            icon="person-add-outline"
            iconColor={theme.accent}
            title={t("profiles.add")}
            onPress={() => setProfileModal("new")}
            chevron={false}
          />
          <Divider />
          {/* Allergies + emergency card (F3) — both scoped to the active profile */}
          <SettingRow
            icon="shield-outline"
            iconColor={theme.accent}
            title={t("allergies.title")}
            subtitle={t("allergies.settingsSubtitle")}
            onPress={() => router.push("/allergies")}
          />
          <Divider />
          <SettingRow
            icon="medkit-outline"
            iconColor="#dc2626"
            title={t("emergency.title")}
            subtitle={t("emergency.settingsSubtitle")}
            onPress={() => router.push("/emergency")}
          />
        </View>

        <SectionHeader title={t("settings.sectionData")} />
        {/* Health Connect one-way vitals sync (F2, Android only) */}
        {isHealthSyncSupported() && (
          <View className="mx-5 mb-2 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
            <View className="flex-row items-center px-4 py-3.5 gap-3">
              <Ionicons name="fitness-outline" size={20} color={theme.accent} />
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-text">{t("settings.healthSync")}</Text>
                <Text className="text-xs text-muted mt-0.5 leading-4">{t("settings.healthSyncSubtitle")}</Text>
              </View>
              <Switch
                value={healthSyncOn}
                onValueChange={handleHealthSyncToggle}
                trackColor={{ false: undefined, true: theme.primary }}
                accessibilityLabel={t("settings.healthSync")}
              />
            </View>
          </View>
        )}
        {/* Local-first nudge: users are never told their data isn't backed up
            anywhere and is lost with the phone (audit UX I11). */}
        <View className="mx-5 mb-2 flex-row items-start gap-2 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2.5">
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} style={{ marginTop: 1 }} />
          <Text className="text-xs text-muted flex-1 leading-5">{t("settings.dataLocalNote")}</Text>
        </View>
        <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <SettingRow
            icon="cloud-download-outline"
            title={t("settings.exportButton")}
            subtitle={t("settings.exportSubtitle")}
            onPress={handleExport}
            loading={exporting}
          />
          <Divider />
          <SettingRow
            icon="cloud-upload-outline"
            title={t("settings.importButton")}
            subtitle={t("settings.importSubtitle")}
            onPress={handleImport}
            loading={importing}
          />
          <Divider />
          <SettingRow
            icon="document-text-outline"
            iconColor={theme.accent}
            title={t("report.generate")}
            subtitle={t("report.generateSubtitle")}
            onPress={handleGeneratePdf}
            loading={generatingPdf}
          />
          <Divider />
          {/* Caregiver handoff snapshot (F2) — operational, 100% local. */}
          <SettingRow
            icon="people-outline"
            iconColor={theme.accent}
            title={t("settings.caregiverSnapshot")}
            subtitle={t("settings.caregiverSnapshotSubtitle")}
            onPress={handleCaregiverSnapshot}
            loading={generatingSnapshot}
          />
          <Divider />
          {/* FHIR R4 export (F3): interop with clinics/EHRs, read-only */}
          <SettingRow
            icon="share-outline"
            iconColor={theme.accent}
            title={t("fhir.settingsTitle")}
            subtitle={t("fhir.settingsSubtitle")}
            onPress={handleFhirExport}
            loading={exportingFhir}
          />
        </View>

        {/* ─── Language ─── */}
        <SectionHeader title={t("settings.sectionLanguage")} />
        <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          {(["es", "en"] as const).map((lang, idx) => (
            <View key={lang}>
              {idx > 0 && <Divider />}
              <SettingRow
                icon={currentLang === lang ? "radio-button-on" : "radio-button-off-outline"}
                iconColor={currentLang === lang ? theme.primary : theme.muted}
                title={lang === "es" ? t("settings.languageEs") : t("settings.languageEn")}
                onPress={() => handleLanguage(lang)}
                chevron={false}
              />
            </View>
          ))}
        </View>

        {/* ─── Appearance ─── */}
        <SectionHeader title={t("settings.sectionAppearance")} />
        <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          {([
            { mode: "system" as ThemeMode, label: t("settings.themeSystem"), icon: "phone-portrait-outline" },
            { mode: "light"  as ThemeMode, label: t("settings.themeLight"),  icon: "sunny-outline" },
            { mode: "dark"   as ThemeMode, label: t("settings.themeDark"),   icon: "moon-outline" },
          ] as { mode: ThemeMode; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[]).map(({ mode, label, icon }, idx) => (
            <View key={mode}>
              {idx > 0 && <Divider />}
              <SettingRow
                icon={themeMode === mode ? "radio-button-on" : "radio-button-off-outline"}
                iconColor={themeMode === mode ? theme.primary : theme.muted}
                title={label}
                value={themeMode === mode ? undefined : undefined}
                onPress={() => handleTheme(mode)}
                chevron={false}
              />
            </View>
          ))}
          {/* Senior / low-vision mode (F1) */}
          <Divider />
          <View className="flex-row items-center px-4 py-3.5 gap-3">
            <Ionicons name="text-outline" size={20} color={theme.primary} />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text">{t("settings.seniorMode")}</Text>
              <Text className="text-xs text-muted mt-0.5 leading-4">{t("settings.seniorModeSubtitle")}</Text>
            </View>
            <Switch
              value={seniorMode}
              onValueChange={(on) => { Haptics.selectionAsync(); setSeniorMode(on); }}
              trackColor={{ false: undefined, true: theme.primary }}
              accessibilityLabel={t("settings.seniorMode")}
            />
          </View>
        </View>

        {/* ─── About ─── */}
        <SectionHeader title={t("settings.sectionAbout")} />
        <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <SettingRow
            icon="information-circle-outline"
            iconColor={theme.muted}
            title={t("settings.version")}
            value={appVersion}
          />
          <Divider />
          <SettingRow
            icon="shield-checkmark-outline"
            iconColor={theme.success}
            title={t("settings.privacyPolicy")}
            onPress={() => Linking.openURL("https://giulianotaliano.github.io/pill-o-clock/privacy-policy.html")}
          />
        </View>
        {/* RxTerms data attribution (required courtesy — see scripts/build-drug-db.mjs) */}
        <Text className="mx-6 mt-2 text-[11px] text-muted leading-4">
          {t("settings.rxtermsAttribution")}
        </Text>

        {/* ─── Danger zone ─── */}
        <SectionHeader title={t("settings.sectionDanger")} danger />
        <View className="mx-5 rounded-2xl overflow-hidden bg-card" style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <SettingRow
            icon="trash-outline"
            iconColor="#dc2626"
            title={t("settings.clearData")}
            subtitle={t("settings.clearDataSubtitle")}
            onPress={handleClearData}
            danger
          />
        </View>
      </ScrollView>

      {/* Profile create/edit modal (F2 multi-profile) */}
      <ProfileModal
        visible={profileModal !== null}
        profile={profileModal === "new" ? null : profileModal}
        onSave={handleProfileSave}
        onDelete={handleProfileDelete}
        onClose={() => setProfileModal(null)}
      />
    </SafeAreaView>
  );
}
