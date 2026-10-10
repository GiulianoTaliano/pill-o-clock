import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  Switch,
  Modal,
  AppState,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { useTranslation, changeLanguage } from "../../src/i18n";
import { useAppStore, type ThemeMode } from "../../src/store";
import { useToast } from "../../src/context/ToastContext";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import {
  exportBackup,
  importBackup,
  BackupCancelledError,
  BackupFormatError,
  BackupAttachmentError,
  WrongPassphraseError,
  type BackupPreview,
  type ImportMode,
} from "../../src/services/backup";
import {
  PassphraseModal,
  type PassphraseResult,
} from "../../components/PassphraseModal";
import { ProfileModal } from "../../components/ProfileModal";
import { ProfileChip } from "../../components/ProfileChip";
import { AlarmSoundPicker } from "../../components/AlarmSoundPicker";
import { ReportPreparationModal } from "../../components/ReportPreparationModal";
import {
  requestFullScreenIntentPermission,
  stopSoundPreview,
} from "expo-alarm";
import {
  getReminderReadiness,
  scheduleReminderTest,
  type ReminderReadiness,
} from "../../src/services/reminderReadiness";
import {
  setupNotifications,
  openExactAlarmSettings,
  refreshDoseReminderCategory,
  rebuildDoseNotifications,
} from "../../src/services/notifications";
import {
  SNOOZE_OPTIONS,
  getDefaultSnoozeMinutes,
  setDefaultSnoozeMinutes,
} from "../../src/services/snoozeSettings";
import {
  getDrugRegionOverride,
  setDrugRegion,
} from "../../src/services/deviceCountry";
import {
  isAppLockSupported,
  isAppLockEnabled,
  isDeviceSecuredAsync,
  authenticateAsync,
  enableAppLock,
  disableAppLock,
} from "../../src/services/appLock";
import {
  IOS_ALARM_SOUNDS,
  getIosAlarmSound,
  setIosAlarmSound,
  type IosAlarmSound,
} from "../../src/services/iosAlarmSound";
import {
  isHealthSyncSupported,
  isHealthSyncEnabled,
  enableHealthSync,
  disableHealthSync,
  getHealthSyncPermissionStatus,
} from "../../src/services/healthSync";
import { isTtsEnabled, setTtsEnabled } from "../../src/services/tts";
import { DEFAULT_PROFILE_ID } from "../../src/services/profileStore";
import { storage } from "../../src/storage";
import type { Profile } from "../../src/types";

type Category =
  | "reminders"
  | "people"
  | "data"
  | "access"
  | "language"
  | "about";
type Icon = React.ComponentProps<typeof Ionicons>["name"];
const CATEGORIES: { id: Category; icon: Icon }[] = [
  { id: "reminders", icon: "notifications-outline" },
  { id: "people", icon: "people-outline" },
  { id: "data", icon: "folder-open-outline" },
  { id: "access", icon: "accessibility-outline" },
  { id: "language", icon: "language-outline" },
  { id: "about", icon: "information-circle-outline" },
];
const LAST_BACKUP = "@pilloclock/last_backup_prepared";
const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((sum, value) => sum + value, 0);

function Row({
  title,
  subtitle,
  value,
  icon = "chevron-forward",
  onPress,
  selected,
  disabled = false,
  loading = false,
  danger = false,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: Icon;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      accessibilityRole={selected === undefined ? "button" : "radio"}
      accessibilityState={{
        disabled: disabled || loading,
        busy: loading,
        ...(selected === undefined ? {} : { checked: selected }),
      }}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(". ")}
      disabled={disabled || loading || !onPress}
      onPress={onPress}
      className="bg-card rounded-2xl px-4 py-4 mb-2 border border-border"
      style={{ minHeight: 60, opacity: disabled ? 0.6 : 1 }}
    >
      <View className="flex-row items-center gap-3">
        <Ionicons
          name={
            selected === undefined
              ? icon
              : selected
              ? "radio-button-on"
              : "radio-button-off-outline"
          }
          size={22}
          color={danger ? theme.danger : theme.primary}
        />
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-text"
            style={danger ? { color: theme.danger } : undefined}
          >
            {title}
          </Text>
          {subtitle && (
            <Text className="text-sm text-muted leading-5 mt-1">
              {subtitle}
            </Text>
          )}
          {value && <Text className="text-sm text-primary mt-1">{value}</Text>}
        </View>
        {loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : onPress && selected === undefined ? (
          <Ionicons name="chevron-forward" size={18} color={theme.muted} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
function Note({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Text
      className="text-sm leading-6 mb-4 text-muted"
      style={danger ? { color: "#b42336" } : undefined}
    >
      {children}
    </Text>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className="text-base font-bold text-text mt-5 mb-3"
    >
      {children}
    </Text>
  );
}
function Toggle({
  title,
  subtitle,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View className="flex-row items-center bg-card border border-border rounded-2xl px-4 py-4 mb-2 gap-3">
      <View className="flex-1">
        <Text className="text-base font-semibold text-text">{title}</Text>
        {subtitle && (
          <Text className="text-sm text-muted leading-5 mt-1">{subtitle}</Text>
        )}
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        accessibilityState={{ disabled }}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: theme.actionFill }}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const { showToast } = useToast();
  const store = useAppStore();
  const [category, setCategory] = useState<Category | null>(null);
  const [reportKind, setReportKind] = useState<
    "report" | "caregiver" | "fhir" | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReminderReadiness | null>(null);
  const [profileModal, setProfileModal] = useState<"new" | Profile | null>(
    null
  );
  const createdProfile = useRef<Profile | null>(null);
  const [passModal, setPassModal] = useState<{
    mode: "set" | "enter";
    resolve: (r: PassphraseResult) => void;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<{
    preview: BackupPreview;
    resolve: (mode: ImportMode | null) => void;
  } | null>(null);
  const pendingPass = useRef<((r: PassphraseResult) => void) | null>(null);
  const pendingImport = useRef<((mode: ImportMode | null) => void) | null>(
    null
  );
  const [lastBackup, setLastBackup] = useState(() =>
    storage.getString(LAST_BACKUP)
  );
  const [snooze, setSnooze] = useState(getDefaultSnoozeMinutes);
  const [iosSound, setIosSound] = useState<IosAlarmSound>(getIosAlarmSound);
  const [lockOn, setLockOn] = useState(isAppLockEnabled);
  const [secured, setSecured] = useState(true);
  const [healthOn, setHealthOn] = useState(isHealthSyncEnabled);
  const [healthStatus, setHealthStatus] = useState("off");
  const [ttsOn, setTtsOn] = useState(isTtsEnabled);
  const [region, setRegion] = useState<string | null>(getDrugRegionOverride);
  const active = store.profiles.find((p) => p.id === store.activeProfileId);
  const person = active?.name || t("profiles.me");
  const unavailable = busy !== null;
  const refresh = useCallback(async () => {
    setReadiness(await getReminderReadiness());
    setHealthOn(isHealthSyncEnabled());
    setHealthStatus(await getHealthSyncPermissionStatus());
    if (isAppLockSupported()) {
      try {
        setSecured(await isDeviceSecuredAsync());
      } catch {
        setSecured(false);
      }
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
      });
      return () => {
        sub.remove();
        void stopSoundPreview().catch(() => {});
      };
    }, [refresh])
  );
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!category) return false;
      setCategory(null);
      return true;
    });
    return () => sub.remove();
  }, [category]);
  useEffect(
    () => () => {
      pendingPass.current?.({ kind: "cancel" });
      pendingImport.current?.(null);
    },
    []
  );
  const run = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await work();
    } catch {
      showToast(t("uxSettings.operationError"), "error");
    } finally {
      setBusy(null);
    }
  };
  const promptPass = (mode: "set" | "enter") =>
    new Promise<PassphraseResult>((resolve) => {
      pendingPass.current = resolve;
      setPassModal({ mode, resolve });
    });
  const finishPass = (result: PassphraseResult) => {
    passModal?.resolve(result);
    pendingPass.current = null;
    setPassModal(null);
  };
  const finishImport = (mode: ImportMode | null) => {
    importPreview?.resolve(mode);
    pendingImport.current = null;
    setImportPreview(null);
  };
  const exportData = () =>
    run("export", async () => {
      const result = await promptPass("set");
      if (result.kind === "cancel") return;
      try {
        const { missingAttachments } = await exportBackup(
          result.kind === "passphrase" ? result.passphrase : undefined
        );
        const stamp = new Date().toISOString();
        storage.set(LAST_BACKUP, stamp);
        setLastBackup(stamp);
        if (missingAttachments > 0)
          showToast(
            t("uxSettings.exportPartial", { count: missingAttachments }),
            "info"
          );
        else showToast(t("uxSettings.exportDone"), "success");
      } catch (error) {
        if (error instanceof BackupCancelledError) return;
        showToast(
          t(
            error instanceof BackupAttachmentError
              ? "uxSettings.attachmentMissing"
              : "settings.exportErrorGeneric"
          ),
          "error"
        );
      }
    });
  const importData = () =>
    run("import", async () => {
      try {
        const result = await importBackup(
          "merge",
          async () => {
            const result = await promptPass("enter");
            return result.kind === "passphrase" ? result.passphrase : null;
          },
          (preview) =>
            new Promise((resolve) => {
              pendingImport.current = resolve;
              setImportPreview({ preview, resolve });
            })
        );
        await store.loadAll();
        await Promise.all([
          store.loadHealthMeasurements(),
          store.loadDailyCheckins(),
        ]);
        showToast(
          t("uxSettings.importDone", {
            inserted: total(result.inserted),
            skipped: total(result.skipped),
          }),
          "success"
        );
        if (result.reminderErrors)
          showToast(t("uxSettings.reminderWarning"), "info");
        if (result.missingAttachments)
          Alert.alert(
            t("uxSettings.preview"),
            t("uxSettings.legacyAttachments", {
              count: result.missingAttachments,
            })
          );
      } catch (error) {
        if (error instanceof BackupCancelledError) return;
        showToast(
          t(
            error instanceof WrongPassphraseError
              ? "backupCrypto.wrongPassphrase"
              : error instanceof BackupFormatError
              ? "settings.importErrorFormat"
              : "settings.importErrorGeneric"
          ),
          "error"
        );
      }
    });
  const clear = () =>
    Alert.alert(
      t("settings.clearDataConfirmTitle"),
      t("settings.clearDataConfirmMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.clearDataConfirmButton"),
          style: "destructive",
          onPress: () =>
            Alert.alert(
              t("settings.clearDataFinalTitle"),
              t("settings.clearDataFinalMsg"),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("settings.clearDataFinalButton"),
                  style: "destructive",
                  onPress: () => {
                    void run("reset", async () => {
                      await store.resetAllData();
                      await store.loadAll();
                      showToast(t("uxSettings.dataReset"), "success");
                    });
                  },
                },
              ]
            ),
        },
      ]
    );
  const saveProfile = async (
    name: string,
    color: string,
    contact: { name: string; phone: string }
  ) => {
    if (profileModal === "new") {
      const p =
        createdProfile.current ??
        (await store.addProfile(name, color, contact));
      if (createdProfile.current)
        await store.renameProfile(p.id, name, color, contact);
      createdProfile.current = p;
      await store.switchProfile(p.id);
    } else if (profileModal)
      await store.renameProfile(profileModal.id, name, color, contact);
  };
  const lang = i18n.language.startsWith("es")
    ? "es"
    : i18n.language.startsWith("pt")
    ? "pt"
    : "en";
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        key={category ?? "root"}
        contentContainerStyle={{ padding: 20, paddingBottom: 44 }}
        showsVerticalScrollIndicator
      >
        {category && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setCategory(null)}
            className="flex-row items-center min-h-[48px] mb-1 gap-2"
          >
            <Ionicons name="arrow-back" size={22} color={theme.primary} />
            <Text className="text-primary font-semibold">
              {t("uxSettings.back")}
            </Text>
          </TouchableOpacity>
        )}
        <Text
          accessibilityRole="header"
          className="text-3xl font-bold text-text mb-3"
        >
          {category ? t("uxSettings." + category) : t("settings.title")}
        </Text>
        <View className="items-start mb-5">
          <ProfileChip />
        </View>
        {!category &&
          CATEGORIES.map((item) => (
            <Row
              key={item.id}
              title={t("uxSettings." + item.id)}
              subtitle={
                item.id === "about"
                  ? undefined
                  : t("uxSettings." + item.id + "Hint")
              }
              icon={item.icon}
              onPress={() => setCategory(item.id)}
            />
          ))}
        {category === "reminders" && (
          <>
            <Note>{t("profiles.alarmsNote")}</Note>
            {(["notifications", "exact", "fullScreen"] as const)
              .filter(
                (key) => key === "notifications" || Platform.OS === "android"
              )
              .map((key) => (
                <Row
                  key={key}
                  title={t("uxSettings." + key)}
                  subtitle={t("uxSettings.permissionHint")}
                  value={t("uxSettings." + (readiness?.[key] ?? "pending"))}
                  loading={busy === key}
                  disabled={
                    unavailable ||
                    Platform.OS === "web" ||
                    readiness?.[key] === "unavailable"
                  }
                  onPress={() => {
                    void run(key, async () => {
                      if (key === "notifications") {
                        if (
                          readiness?.notifications === "denied" ||
                          readiness?.notifications === "limited"
                        )
                          await Linking.openSettings();
                        else
                          await setupNotifications({
                            requestPermissions: true,
                          });
                      } else if (key === "exact")
                        await openExactAlarmSettings();
                      else await requestFullScreenIntentPermission();
                      await refresh();
                    });
                  }}
                />
              ))}
            <Row
              title={t("uxSettings.checkAgain")}
              icon="refresh-outline"
              onPress={() => {
                void run("check", refresh);
              }}
              loading={busy === "check"}
              disabled={unavailable}
            />
            <Row
              title={t("uxSettings.test")}
              subtitle={t("uxSettings.testHint")}
              icon="notifications-outline"
              disabled={unavailable || readiness?.notifications !== "granted"}
              loading={busy === "test"}
              onPress={() => {
                void run("test", async () => {
                  await scheduleReminderTest();
                  showToast(t("uxSettings.testScheduled"), "success");
                });
              }}
            />
            <Note>{t("uxSettings.checkHint")}</Note>
            <Heading>{t("settings.sectionAlarmSound")}</Heading>
            {Platform.OS === "android" && <AlarmSoundPicker maxHeight={360} />}
            {Platform.OS === "ios" &&
              IOS_ALARM_SOUNDS.map((sound) => (
                <Row
                  key={sound}
                  title={t("settings.iosSound_" + sound)}
                  subtitle={t("settings.iosSound_" + sound + "_sub")}
                  selected={iosSound === sound}
                  disabled={unavailable}
                  onPress={() => {
                    void run("sound", async () => {
                      const previous = iosSound;
                      setIosAlarmSound(sound);
                      try {
                        await rebuildDoseNotifications();
                        setIosSound(sound);
                      } catch (error) {
                        setIosAlarmSound(previous);
                        throw error;
                      }
                    });
                  }}
                />
              ))}
            <Heading>{t("settings.snoozeDefaultTitle")}</Heading>
            <Note>{t("settings.snoozeDefaultSubtitle")}</Note>
            <View className="flex-row flex-wrap gap-2">
              {SNOOZE_OPTIONS.map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: snooze === minutes,
                    disabled: unavailable,
                  }}
                  disabled={unavailable}
                  onPress={() => {
                    void run("snooze", async () => {
                      const previous = snooze;
                      setDefaultSnoozeMinutes(minutes);
                      try {
                        await refreshDoseReminderCategory();
                        setSnooze(minutes);
                      } catch (error) {
                        setDefaultSnoozeMinutes(previous);
                        throw error;
                      }
                    });
                  }}
                  className={
                    "rounded-xl min-h-[48px] px-4 justify-center border " +
                    (snooze === minutes
                      ? "bg-action border-action"
                      : "bg-card border-border")
                  }
                >
                  <Text
                    className={
                      snooze === minutes
                        ? "text-white font-bold"
                        : "text-text font-semibold"
                    }
                  >
                    {minutes} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        {category === "people" && (
          <>
            <Note>{t("profiles.alarmsNote")}</Note>
            {store.profiles.map((p) => (
              <View key={p.id} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Row
                    title={p.name || t("profiles.me")}
                    selected={p.id === store.activeProfileId}
                    disabled={unavailable}
                    onPress={() => {
                      void run("profile", () => store.switchProfile(p.id));
                    }}
                  />
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={
                    t("profiles.editTitle") +
                    ": " +
                    (p.name || t("profiles.me"))
                  }
                  disabled={unavailable}
                  onPress={() => setProfileModal(p)}
                  className="w-12 h-12 items-center justify-center bg-card border border-border rounded-xl mb-2"
                >
                  <Ionicons
                    name="pencil-outline"
                    size={20}
                    color={theme.primary}
                  />
                </TouchableOpacity>
              </View>
            ))}
            <Row
              title={t("profiles.add")}
              icon="person-add-outline"
              disabled={unavailable}
              onPress={() => {
                createdProfile.current = null;
                setProfileModal("new");
              }}
            />
            <Heading>{t("uxSettings.activePerson", { name: person })}</Heading>
            <Row
              title={t("allergies.title")}
              subtitle={t("allergies.settingsSubtitle")}
              icon="shield-outline"
              onPress={() => router.push("/allergies")}
            />
            <Row
              title={t("emergency.title")}
              subtitle={t("emergency.settingsSubtitle")}
              icon="medkit-outline"
              onPress={() => router.push("/emergency")}
            />
          </>
        )}
        {category === "data" && (
          <>
            <Note>{t("settings.dataLocalNote")}</Note>
            <Heading>{t("uxSettings.allProfiles")}</Heading>
            <Note>{t("uxSettings.backupComplete")}</Note>
            <Note>
              {lastBackup
                ? t("uxSettings.lastBackup", {
                    date: new Date(lastBackup).toLocaleString(),
                  })
                : t("uxSettings.noBackup")}
            </Note>
            <Row
              title={t("settings.exportButton")}
              icon="cloud-download-outline"
              disabled={unavailable}
              loading={busy === "export"}
              onPress={() => {
                void exportData();
              }}
            />
            <Row
              title={t("settings.importButton")}
              subtitle={t("uxSettings.mergeHint")}
              icon="cloud-upload-outline"
              disabled={unavailable}
              loading={busy === "import"}
              onPress={() => {
                void importData();
              }}
            />
            <Heading>{t("uxSettings.activePerson", { name: person })}</Heading>
            <Row
              title={t("report.generate")}
              subtitle={t("report.generateSubtitle")}
              icon="document-text-outline"
              disabled={unavailable}
              onPress={() => setReportKind("report")}
            />
            <Row
              title={t("settings.caregiverSnapshot")}
              subtitle={t("settings.caregiverSnapshotSubtitle")}
              icon="people-outline"
              disabled={unavailable}
              onPress={() => setReportKind("caregiver")}
            />
            <Row
              title={t("fhir.settingsTitle")}
              subtitle={t("fhir.settingsSubtitle")}
              icon="share-outline"
              disabled={unavailable}
              onPress={() => setReportKind("fhir")}
            />
            {isHealthSyncSupported() && (
              <>
                <Heading>{t("settings.healthSync")}</Heading>
                <Note>{t("uxSettings.ownerOnly")}</Note>
                <Toggle
                  title={t("settings.healthSync")}
                  subtitle={t("uxSettings." + healthStatus)}
                  value={healthOn}
                  disabled={
                    unavailable || store.activeProfileId !== DEFAULT_PROFILE_ID
                  }
                  onChange={(on) => {
                    void run("health", async () => {
                      if (!on) {
                        disableHealthSync();
                        setHealthOn(false);
                      } else {
                        const granted = await enableHealthSync();
                        setHealthOn(granted);
                        if (!granted)
                          showToast(t("settings.healthSyncDenied"), "error");
                      }
                      await refresh();
                    });
                  }}
                />
                {store.activeProfileId !== DEFAULT_PROFILE_ID && (
                  <Note>{t("uxSettings.ownerRequired")}</Note>
                )}
              </>
            )}
            <Heading>{t("settings.sectionDanger")}</Heading>
            <Row
              title={t("settings.clearData")}
              subtitle={t("settings.clearDataSubtitle")}
              icon="trash-outline"
              danger
              disabled={unavailable}
              loading={busy === "reset"}
              onPress={clear}
            />
          </>
        )}
        {category === "access" && (
          <>
            <Heading>{t("settings.sectionAppearance")}</Heading>
            {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
              <Row
                key={mode}
                title={t(
                  "settings.theme" + mode[0].toUpperCase() + mode.slice(1)
                )}
                selected={store.themeMode === mode}
                onPress={() => store.setThemeMode(mode)}
              />
            ))}
            <Toggle
              title={t("uxSettings.largeDoseCards")}
              subtitle={t("settings.seniorModeSubtitle")}
              value={store.seniorMode}
              onChange={store.setSeniorMode}
            />
            <Toggle
              title={t("settings.tts")}
              subtitle={t("settings.ttsSubtitle")}
              value={ttsOn}
              onChange={(on) => {
                setTtsEnabled(on);
                setTtsOn(on);
              }}
            />
            {isAppLockSupported() && (
              <>
                <Heading>{t("settings.sectionSecurity")}</Heading>
                <Toggle
                  title={t("settings.appLockTitle")}
                  subtitle={t("settings.appLockSubtitle")}
                  value={lockOn}
                  disabled={unavailable || (!secured && !lockOn)}
                  onChange={(on) => {
                    void run("lock", async () => {
                      if (
                        !(await authenticateAsync(t("appLock.biometricPrompt")))
                      )
                        return;
                      if (on) await enableAppLock();
                      else await disableAppLock();
                      setLockOn(on);
                    });
                  }}
                />
                {!secured && <Note>{t("appLock.deviceNotSecured")}</Note>}
                <Note>{t("uxSettings.emergencyPrivacy")}</Note>
              </>
            )}
          </>
        )}
        {category === "language" && (
          <>
            <Heading>{t("settings.sectionLanguage")}</Heading>
            {(["es", "en", "pt"] as const).map((language) => (
              <Row
                key={language}
                title={t(
                  language === "es"
                    ? "settings.languageEs"
                    : language === "pt"
                    ? "settings.languagePt"
                    : "settings.languageEn"
                )}
                selected={lang === language}
                disabled={unavailable}
                onPress={() => {
                  void run("language", async () => {
                    await changeLanguage(language);
                    await refreshDoseReminderCategory();
                    await rebuildDoseNotifications();
                  });
                }}
              />
            ))}
            <Heading>{t("settings.sectionDrugRegion")}</Heading>
            <Note>{t("settings.drugRegionSubtitle")}</Note>
            {([null, "AR", "US"] as const).map((country) => (
              <Row
                key={country ?? "auto"}
                title={t(
                  country === null
                    ? "settings.drugRegionAuto"
                    : country === "AR"
                    ? "settings.drugRegionAr"
                    : "settings.drugRegionUs"
                )}
                selected={region === country}
                onPress={() => {
                  setDrugRegion(country);
                  setRegion(country);
                }}
              />
            ))}
          </>
        )}
        {category === "about" && (
          <>
            <View className="bg-card rounded-2xl p-5 border border-border mb-3">
              <Text className="text-base text-text">
                {t("settings.version")}:{" "}
                {Constants.expoConfig?.version ?? "1.0.0"}
              </Text>
            </View>
            <Row
              title={t("settings.privacyPolicy")}
              icon="shield-checkmark-outline"
              onPress={() => {
                void run("privacy", () =>
                  Linking.openURL(
                    "https://giulianotaliano.github.io/pill-o-clock/privacy-policy.html"
                  )
                );
              }}
              loading={busy === "privacy"}
            />
            <Note>{t("settings.rxtermsAttribution")}</Note>
          </>
        )}
      </ScrollView>
      <PassphraseModal
        visible={passModal !== null}
        mode={passModal?.mode ?? "set"}
        onDone={finishPass}
      />
      <ReportPreparationModal
        visible={reportKind !== null}
        kind={reportKind ?? "report"}
        onClose={() => setReportKind(null)}
      />
      <ProfileModal
        visible={profileModal !== null}
        profile={profileModal === "new" ? null : profileModal}
        onSave={saveProfile}
        onDelete={store.removeProfile}
        onClose={() => setProfileModal(null)}
      />
      <Modal
        visible={importPreview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => finishImport(null)}
      >
        <View className="flex-1 bg-black/50 justify-center px-5 py-8">
          <View
            className="bg-card rounded-3xl p-5"
            style={{ maxHeight: "90%" }}
            accessibilityViewIsModal
          >
            <ScrollView showsVerticalScrollIndicator>
              <Text
                accessibilityRole="header"
                className="text-xl font-bold text-text mb-3"
              >
                {t("uxSettings.preview")}
              </Text>
              {importPreview && (
                <>
                  <Note>
                    {t("uxSettings.exportDate", {
                      date: new Date(
                        importPreview.preview.exportedAt
                      ).toLocaleString(),
                      version: importPreview.preview.version,
                    })}
                  </Note>
                  <Note>
                    {t("uxSettings.allProfiles")}:{" "}
                    {importPreview.preview.profiles.join(", ") ||
                      t("profiles.me")}
                  </Note>
                  {Object.entries(importPreview.preview.counts).map(
                    ([key, value]) => (
                      <View
                        key={key}
                        className="flex-row justify-between gap-4 py-2 border-b border-border"
                      >
                        <Text className="text-sm text-text flex-1">
                          {t("uxSettings.count_" + key)}
                        </Text>
                        <Text className="text-sm font-bold text-text">
                          {value}
                        </Text>
                      </View>
                    )
                  )}
                  <Text className="text-sm text-primary mt-4 mb-2">
                    {t("uxSettings.conflicts", {
                      count: total(importPreview.preview.conflicts),
                    })}
                  </Text>
                  <Note>{t("uxSettings.mergeHint")}</Note>
                  {importPreview.preview.missingAttachments > 0 && (
                    <Note>
                      {t("uxSettings.legacyAttachments", {
                        count: importPreview.preview.missingAttachments,
                      })}
                    </Note>
                  )}
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => finishImport("merge")}
                    className="bg-action rounded-xl min-h-[52px] items-center justify-center px-4 py-3 mb-3"
                  >
                    <Text className="text-white font-bold text-center">
                      {t("settings.importModeMerge")}
                    </Text>
                  </TouchableOpacity>
                  <Note>{t("uxSettings.replaceHint")}</Note>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        t("settings.importModeReplace"),
                        t("uxSettings.replaceConfirm", {
                          count: total(importPreview.preview.counts),
                        }),
                        [
                          { text: t("common.cancel"), style: "cancel" },
                          {
                            text: t("settings.importModeReplace"),
                            style: "destructive",
                            onPress: () => finishImport("replace"),
                          },
                        ]
                      )
                    }
                    className="border border-danger rounded-xl min-h-[52px] items-center justify-center px-4 py-3 mb-2"
                  >
                    <Text className="text-danger font-semibold text-center">
                      {t("settings.importModeReplace")}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => finishImport(null)}
                className="min-h-[48px] items-center justify-center"
              >
                <Text className="text-primary font-semibold">
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
