import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useCallback, useEffect, useState, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, subDays } from "date-fns";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import {
  collectReportData,
  generateAndShareReport,
  type ReportData,
  type ReportOptions,
} from "../src/services/pdfReport";
import { generateAndShareCaregiverSnapshot } from "../src/services/caregiverSnapshot";
import { generateAndShareFhirBundle } from "../src/services/fhirExport";
import { toDateString } from "../src/utils";
import {
  describeMedicationPlan,
  isMedicationCurrent,
} from "../src/services/carePlan";
import { getActiveProfileId } from "../src/services/profileStore";

interface Props {
  visible: boolean;
  kind?: "report" | "caregiver" | "fhir";
  initialFrom?: string;
  initialTo?: string;
  onClose: () => void;
}
export function ReportPreparationModal({
  visible,
  kind = "report",
  initialFrom,
  initialTo,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState(
      initialFrom ?? toDateString(subDays(new Date(), 29))
    ),
    [to, setTo] = useState(initialTo ?? toDateString(new Date()));
  const [sections, setSections] = useState({
    medications: true,
    logs: true,
    measurements: true,
    checkins: true,
  });
  const [data, setData] = useState<ReportData | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [sharing, setSharing] = useState(false),
    [picker, setPicker] = useState<"from" | "to" | null>(null);
  const request = useRef(0),
    shareGuard = useRef(false);
  useEffect(() => {
    if (visible) {
      setFrom(
        initialFrom ??
          toDateString(subDays(new Date(), kind === "caregiver" ? 6 : 29))
      );
      setTo(initialTo ?? toDateString(new Date()));
    }
  }, [visible, initialFrom, initialTo, kind]);
  const load = useCallback(async () => {
    const token = ++request.current;
    setLoading(true);
    setError(false);
    setData(null);
    try {
      const result = await collectReportData({ from, to });
      if (request.current === token) setData(result);
    } catch {
      if (request.current === token) {
        setError(true);
        setData(null);
      }
    } finally {
      if (request.current === token) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    const requests = request;
    if (visible) void load();
    return () => {
      requests.current++;
    };
  }, [visible, load]);
  const share = async () => {
    if (shareGuard.current || !data) return;
    if (getActiveProfileId() !== data.profileId) {
      Alert.alert(t("common.error"), t("uxHealth.profileChanged"));
      void load();
      return;
    }
    shareGuard.current = true;
    setSharing(true);
    try {
      if (kind === "report")
        await generateAndShareReport({
          from,
          to,
          sections,
        } satisfies ReportOptions);
      else if (kind === "caregiver") await generateAndShareCaregiverSnapshot();
      else await generateAndShareFhirBundle();
      onClose();
    } catch {
      Alert.alert(t("common.error"), t("uxHealth.shareError"));
    } finally {
      shareGuard.current = false;
      setSharing(false);
    }
  };
  const active = data?.medications.filter((m) => isMedicationCurrent(m)) ?? [];
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!sharing) onClose();
      }}
    >
      <View
        accessibilityViewIsModal
        className="flex-1 bg-background"
        style={{ paddingTop: Math.max(insets.top, 20) }}
      >
        <View className="px-5 flex-row items-center gap-3 mb-4">
          <Text
            accessibilityRole="header"
            className="text-2xl font-bold text-text flex-1"
          >
            {t("uxHealth.prepareExport")}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={sharing}
            onPress={onClose}
            className="min-h-[48px] px-3 justify-center"
          >
            <Text className="text-primary">{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          }}
        >
          <Text className="text-base text-muted mb-5">
            {t(
              kind === "report"
                ? "uxHealth.reportScope"
                : kind === "fhir"
                ? "uxHealth.fhirScope"
                : "uxHealth.snapshotScope"
            )}
          </Text>
          {kind === "report" && (
            <>
              <Text className="font-semibold text-text mb-2">
                {t("uxHealth.period")}
              </Text>
              <View className="flex-row gap-2 mb-4">
                {(["from", "to"] as const).map((key) => (
                  <TouchableOpacity
                    key={key}
                    accessibilityRole="button"
                    onPress={() => setPicker(key)}
                    className="flex-1 min-h-[48px] bg-card border border-border rounded-2xl p-3"
                  >
                    <Text className="text-muted text-xs">
                      {t(key === "from" ? "uxHealth.from" : "uxHealth.until", {
                        date: "",
                      })}
                    </Text>
                    <Text className="text-text mt-1">
                      {format(
                        new Date((key === "from" ? from : to) + "T12:00"),
                        "PP",
                        { locale: getDateLocale() }
                      )}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {picker && (
                <DateTimePicker
                  mode="date"
                  value={new Date((picker === "from" ? from : to) + "T12:00")}
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    if (Platform.OS !== "ios") setPicker(null);
                    if (event.type === "set" && date)
                      (picker === "from" ? setFrom : setTo)(toDateString(date));
                  }}
                />
              )}
            </>
          )}
          {loading ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={theme.primary} />
              <Text className="text-muted mt-3">{t("uxHealth.loading")}</Text>
            </View>
          ) : error ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void load()}
              className="bg-card border border-border rounded-2xl p-4 min-h-[48px]"
            >
              <Text accessibilityRole="alert" className="text-danger">
                {t("uxHealth.loadError")} · {t("uxHealth.retry")}
              </Text>
            </TouchableOpacity>
          ) : (
            data && (
              <>
                <View className="bg-card border border-border rounded-2xl p-5 mb-4">
                  <Text className="text-xs uppercase tracking-wider text-muted">
                    {t("uxHealth.patient")}
                  </Text>
                  <Text className="text-2xl font-bold text-text mt-2">
                    {data.displayName}
                  </Text>
                  <Text className="text-sm text-muted mt-3">
                    {t("uxHealth.reportPreview", {
                      medications: active.length,
                      logs: data.logs.length,
                      measurements: data.measurements.length,
                      checkins: data.checkins.length,
                    })}
                  </Text>
                </View>
                {kind === "report" &&
                  Object.keys(sections).map((key) => {
                    const id = key as keyof typeof sections;
                    const label = {
                      medications: "uxHealth.reportMedication",
                      logs: "uxHealth.reportLogs",
                      measurements: "uxHealth.reportMeasurements",
                      checkins: "uxHealth.reportDiary",
                    }[id];
                    return (
                      <TouchableOpacity
                        key={id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: sections[id] }}
                        onPress={() =>
                          setSections((s) => ({ ...s, [id]: !s[id] }))
                        }
                        className="min-h-[48px] bg-card border border-border rounded-2xl p-4 mb-2 flex-row items-center gap-3"
                      >
                        <Text className="text-primary text-lg">
                          {sections[id] ? "☑" : "☐"}
                        </Text>
                        <Text className="text-text flex-1">{t(label)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                {(kind !== "report" || sections.medications) &&
                  active.map((m) => (
                    <View key={m.id} className="border-b border-border py-4">
                      <Text className="text-base font-semibold text-text">
                        {m.name}
                      </Text>
                      <Text className="text-sm text-muted mt-2 leading-5">
                        {describeMedicationPlan(
                          m,
                          data.schedules.get(m.id) ?? [],
                          t
                        )}
                      </Text>
                    </View>
                  ))}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: sharing,
                    disabled:
                      sharing ||
                      (kind === "report" &&
                        !Object.values(sections).some(Boolean)),
                  }}
                  disabled={
                    sharing ||
                    (kind === "report" &&
                      !Object.values(sections).some(Boolean))
                  }
                  onPress={() => void share()}
                  className="bg-action min-h-[52px] rounded-2xl p-4 items-center mt-6"
                >
                  <Text className="text-white font-bold">
                    {sharing
                      ? t("common.saving")
                      : t(
                          kind === "fhir" ? "fhir.shareTitle" : "uxHealth.share"
                        )}
                  </Text>
                </TouchableOpacity>
              </>
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
