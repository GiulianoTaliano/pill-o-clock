import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  Share,
  Linking,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { getContentUriAsync } from "expo-file-system/legacy";
import { format } from "date-fns";
import { Appointment } from "../src/types";
import { formatTimeForDisplay } from "../src/utils";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { useAppStore } from "../src/store";
import { isAppointmentPast } from "../src/services/carePlan";

interface Props {
  appt: Appointment | null;
  visible: boolean;
  onClose: () => void;
  onEdit: (appt: Appointment) => void;
  onDelete: (appt: Appointment) => void | Promise<void>;
}

export function AppointmentDetailModal({
  appt,
  visible,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const allDocuments = useAppStore((s) => s.appointmentDocuments);
  const loadDocuments = useAppStore((s) => s.loadAppointmentDocuments);
  const addDocument = useAppStore((s) => s.addAppointmentDocument);
  const removeDocument = useAppStore((s) => s.removeAppointmentDocument);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionGuard = useRef(false);
  const request = useRef(0);
  const documents = allDocuments.filter(
    (doc) => doc.appointmentId === appt?.id
  );
  const appointmentId = appt?.id;
  const load = useCallback(async () => {
    if (!appointmentId) return;
    const token = ++request.current;
    setLoading(true);
    setError(null);
    try {
      await loadDocuments(appointmentId);
    } catch {
      if (request.current === token) setError(t("uxHealth.loadError"));
    } finally {
      if (request.current === token) setLoading(false);
    }
  }, [appointmentId, loadDocuments, t]);
  useEffect(() => {
    const requests = request;
    if (visible) void load();
    return () => {
      requests.current++;
    };
  }, [visible, load]);
  const close = () => {
    if (!actionGuard.current) onClose();
  };
  async function perform(action: () => Promise<unknown>, message: string) {
    if (actionGuard.current) return;
    actionGuard.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(message);
    } finally {
      actionGuard.current = false;
      setBusy(false);
    }
  }
  if (!appt) return null;
  const current = appt;
  const dateLabel = format(new Date(current.date + "T12:00"), "PPP", {
    locale: getDateLocale(),
  });
  const mapsUrl = current.locationCoords
    ? `https://maps.google.com/maps?q=${current.locationCoords.latitude},${current.locationCoords.longitude}`
    : current.location
    ? `https://maps.google.com/maps?q=${encodeURIComponent(current.location)}`
    : undefined;
  const openMap = async () => {
    if (mapsUrl)
      try {
        await Linking.openURL(mapsUrl);
      } catch {
        setError(t("uxHealth.mapUnavailable"));
      }
  };
  const reminder =
    !current.time || current.reminderMinutes === 0
      ? t("uxHealth.noNotifications")
      : current.reminderMinutes === -1
      ? t("uxHealth.reminderExact")
      : t(
          `appointments.${
            (
              {
                60: "reminder1h",
                120: "reminder2h",
                1440: "reminder1d",
              } as Record<number, string>
            )[current.reminderMinutes ?? 60]
          }`
        );
  const button = (
    label: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    onPress: () => void,
    danger = false
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card,
      }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={danger ? theme.danger : theme.primary}
      />
      <Text
        style={{
          color: danger ? theme.danger : theme.primary,
          fontSize: 15,
          fontWeight: "600",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
  const row = (label: string, value: string) => (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 4 }}>
        {label}
      </Text>
      <Text
        selectable
        style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}
      >
        {value}
      </Text>
    </View>
  );
  async function attach() {
    await perform(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      await addDocument(current.id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? undefined,
        size: asset.size ?? undefined,
      });
    }, t("appointments.docPickerError"));
  }
  async function openDocument(fileUri: string, mimeType: string) {
    await perform(async () => {
      try {
        if (Platform.OS === "android")
          await IntentLauncher.startActivityAsync(
            "android.intent.action.VIEW",
            {
              data: await getContentUriAsync(fileUri),
              type: mimeType,
              flags: 1,
            }
          );
        else await Sharing.shareAsync(fileUri, { mimeType });
      } catch {
        await Sharing.shareAsync(fileUri, { mimeType });
      }
    }, t("appointments.docOpenError"));
  }
  function deleteDocument(id: string, name: string) {
    Alert.alert(
      t("uxHealth.deleteDocument", { name }),
      t("appointments.deleteDocMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () =>
            void perform(() => removeDocument(id), t("uxHealth.deleteError")),
        },
      ]
    );
  }
  function deleteAppointment() {
    Alert.alert(
      t("uxHealth.deleteNamed", { name: current.title }),
      t("appointments.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () =>
            void perform(async () => {
              await onDelete(current);
              onClose();
            }, t("uxHealth.deleteError")),
        },
      ]
    );
  }
  const share = () =>
    void perform(
      () =>
        Share.share({
          message: [
            current.title,
            dateLabel +
              (current.time
                ? ` · ${formatTimeForDisplay(current.time)}`
                : ` · ${t("uxHealth.noTime")}`),
            current.doctor,
            current.location,
            current.notes,
            mapsUrl,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      t("uxHealth.shareError")
    );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <Pressable
        onPress={close}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,.5)",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "92%",
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 20,
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontSize: 24, fontWeight: "700" }}
              >
                {current.title}
              </Text>
              {isAppointmentPast(current) && (
                <Text
                  style={{ color: theme.muted, fontSize: 14, marginTop: 4 }}
                >
                  {t("uxHealth.past")}
                </Text>
              )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              disabled={busy}
              onPress={close}
              style={{
                minWidth: 48,
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
          >
            {row(
              t("appointments.fieldDate"),
              dateLabel +
                (current.time
                  ? ` · ${formatTimeForDisplay(current.time)}`
                  : ` · ${t("uxHealth.noTime")}`)
            )}
            {current.doctor
              ? row(t("appointments.fieldDoctor"), current.doctor)
              : null}
            {current.location
              ? row(t("appointments.fieldLocation"), current.location)
              : null}
            {current.notes
              ? row(t("appointments.fieldNotes"), current.notes)
              : null}
            {row(t("appointments.fieldReminder"), reminder)}
            {current.time &&
              current.reminderMinutes !== 0 &&
              !current.notificationId &&
              !isAppointmentPast(current) && (
                <Text
                  style={{ color: theme.warning, fontSize: 14, marginTop: 8 }}
                >
                  {t("uxHealth.reminderNotScheduled")}
                </Text>
              )}
            {current.locationCoords && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("appointments.viewOnMap")}
                onPress={() => void openMap()}
                style={{
                  marginVertical: 16,
                  borderRadius: 18,
                  overflow: "hidden",
                  height: 180,
                }}
              >
                <MapView
                  key={current.id}
                  accessible={false}
                  style={{ flex: 1 }}
                  initialRegion={{
                    ...current.locationCoords,
                    latitudeDelta: 0.008,
                    longitudeDelta: 0.008,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  pointerEvents="none"
                >
                  <Marker coordinate={current.locationCoords} />
                </MapView>
              </TouchableOpacity>
            )}
            {mapsUrl &&
              button(
                t("appointments.viewOnMap"),
                "map-outline",
                () => void openMap()
              )}
            <View style={{ marginTop: 20, marginBottom: 8 }}>
              <Text
                accessibilityRole="header"
                style={{
                  color: theme.text,
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: 8,
                }}
              >
                {t("appointments.documentsTitle")}
              </Text>
              <Text
                style={{ color: theme.muted, fontSize: 13, marginBottom: 8 }}
              >
                {t("uxHealth.documentsImmediate")}
              </Text>
              {button(
                busy
                  ? t("uxHealth.attaching")
                  : t("appointments.attachDocument"),
                "attach-outline",
                () => void attach()
              )}
            </View>
            {loading ? (
              <ActivityIndicator
                accessibilityLabel={t("uxHealth.documentsLoading")}
                color={theme.primary}
              />
            ) : !error && documents.length === 0 ? (
              <Text
                style={{
                  color: theme.muted,
                  fontSize: 14,
                  paddingVertical: 12,
                }}
              >
                {t("appointments.noDocuments")}
              </Text>
            ) : null}
            {documents.map((doc) => (
              <View
                key={doc.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={doc.fileName}
                  disabled={busy}
                  onPress={() => void openDocument(doc.fileUri, doc.mimeType)}
                  style={{ flex: 1, minHeight: 56, paddingVertical: 12 }}
                >
                  <Text style={{ color: theme.text, fontSize: 15 }}>
                    {doc.fileName}
                  </Text>
                  {doc.fileSize != null && (
                    <Text style={{ color: theme.muted, fontSize: 12 }}>
                      {doc.fileSize < 1024
                        ? `${doc.fileSize} B`
                        : `${Math.ceil(doc.fileSize / 1024)} KB`}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("uxHealth.deleteDocument", {
                    name: doc.fileName,
                  })}
                  disabled={busy}
                  onPress={() => deleteDocument(doc.id, doc.fileName)}
                  style={{
                    width: 48,
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={theme.danger}
                  />
                </TouchableOpacity>
              </View>
            ))}
            {error && (
              <View style={{ paddingVertical: 12 }}>
                <Text
                  accessibilityRole="alert"
                  style={{ color: theme.danger, fontSize: 15 }}
                >
                  {error}
                </Text>
                {button(t("uxHealth.retry"), "refresh", () => void load())}
              </View>
            )}
            <View style={{ marginTop: 20, gap: 8 }}>
              {button(
                t("common.share", {
                  defaultValue: t("uxHealth.shareAppointment"),
                }),
                "share-outline",
                share
              )}
              {button(t("common.edit"), "create-outline", () =>
                onEdit(current)
              )}
              {button(
                t("common.delete"),
                "trash-outline",
                deleteAppointment,
                true
              )}
            </View>
            {busy && (
              <ActivityIndicator
                style={{ marginTop: 12 }}
                color={theme.primary}
              />
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
