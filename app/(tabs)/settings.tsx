import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useToast } from "../../src/context/ToastContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import Constants from "expo-constants";
import { useTranslation, changeLanguage } from "../../src/i18n";
import { useAppStore } from "../../src/store";
import { exportBackup, importBackup, BackupCancelledError, BackupFormatError } from "../../src/services/backup";

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ title, danger = false }: { title: string; danger?: boolean }) {
  return (
    <View className="px-5 pt-6 pb-1">
      <Text
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: danger ? "#dc2626" : "#94a3b8" }}
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
  iconColor = "#4f9cff",
  title,
  subtitle,
  value,
  onPress,
  loading = false,
  danger = false,
  chevron,
}: RowProps) {
  const isInteractive = !!onPress;
  const showChevron = chevron ?? (isInteractive && !value);

  const inner = (
    <View className="flex-row items-center px-5 py-4 bg-white" style={{ minHeight: 60 }}>
      {/* icon pill */}
      <View
        className="w-9 h-9 rounded-xl items-center justify-center mr-4"
        style={{ backgroundColor: iconColor + "18" }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>

      {/* text */}
      <View className="flex-1">
        <Text
          className="text-sm font-semibold"
          style={{ color: danger ? "#dc2626" : "#1e293b" }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-muted mt-0.5">{subtitle}</Text>
        ) : null}
      </View>

      {/* right side */}
      {loading ? (
        <ActivityIndicator size="small" color="#4f9cff" />
      ) : value ? (
        <Text className="text-sm text-muted">{value}</Text>
      ) : showChevron ? (
        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
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
  const resetAllData = useAppStore((s) => s.resetAllData);
  const loadAll = useAppStore((s) => s.loadAll);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const { showToast } = useToast();

  // ─── Handlers ──────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      await exportBackup();
    } catch {
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

  function handleClearData() {
    Alert.alert(
      t("settings.clearDataConfirmTitle"),
      t("settings.clearDataConfirmMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.clearDataConfirmButton"),
          style: "destructive",
          onPress: async () => {
            await resetAllData();
            await loadAll();
          },
        },
      ]
    );
  }

  function handleLanguage(lang: "es" | "en") {
    changeLanguage(lang);
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

        {/* ─── Your data ─── */}
        <SectionHeader title={t("settings.sectionData")} />
        <View className="mx-5 rounded-2xl overflow-hidden" style={{ backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <SettingRow
            icon="cloud-download-outline"
            iconColor="#4f9cff"
            title={t("settings.exportButton")}
            subtitle={t("settings.exportSubtitle")}
            onPress={handleExport}
            loading={exporting}
          />
          <Divider />
          <SettingRow
            icon="cloud-upload-outline"
            iconColor="#4f9cff"
            title={t("settings.importButton")}
            subtitle={t("settings.importSubtitle")}
            onPress={handleImport}
            loading={importing}
          />
        </View>

        {/* ─── Language ─── */}
        <SectionHeader title={t("settings.sectionLanguage")} />
        <View className="mx-5 rounded-2xl overflow-hidden" style={{ backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          {(["es", "en"] as const).map((lang, idx) => (
            <View key={lang}>
              {idx > 0 && <Divider />}
              <SettingRow
                icon={currentLang === lang ? "radio-button-on" : "radio-button-off-outline"}
                iconColor={currentLang === lang ? "#4f9cff" : "#94a3b8"}
                title={lang === "es" ? t("settings.languageEs") : t("settings.languageEn")}
                onPress={() => handleLanguage(lang)}
                chevron={false}
              />
            </View>
          ))}
        </View>

        {/* ─── About ─── */}
        <SectionHeader title={t("settings.sectionAbout")} />
        <View className="mx-5 rounded-2xl overflow-hidden" style={{ backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <SettingRow
            icon="information-circle-outline"
            iconColor="#94a3b8"
            title={t("settings.version")}
            value={appVersion}
          />
        </View>

        {/* ─── Danger zone ─── */}
        <SectionHeader title={t("settings.sectionDanger")} danger />
        <View className="mx-5 rounded-2xl overflow-hidden" style={{ backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
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
    </SafeAreaView>
  );
}
