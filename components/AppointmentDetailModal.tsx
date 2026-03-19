import React, { useEffect, useRef } from "react";
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
  PanResponder,
  Pressable,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

// ─── Reminder label helper ─────────────────────────────────────────────────

const REMINDER_MINUTES = [
  { key: "reminderNone", minutes: 0 },
  { key: "reminder1h",   minutes: 60 },
  { key: "reminder2h",   minutes: 120 },
  { key: "reminder1d",   minutes: 1440 },
];

// ─── Row component ─────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
  color = "#64748b",
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View className="flex-row items-start gap-3 py-2.5 border-b border-border">
      <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mt-0.5">
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-muted font-semibold mb-0.5 uppercase tracking-wider">
          {label}
        </Text>
        <Text className="text-sm text-text font-medium leading-5">{value}</Text>
      </View>
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface Props {
  appt: Appointment | null;
  visible: boolean;
  onClose: () => void;
  onEdit: (appt: Appointment) => void;
  onDelete: (appt: Appointment) => void;
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
  const appointmentDocuments = useAppStore((s) => s.appointmentDocuments);
  const loadAppointmentDocuments = useAppStore((s) => s.loadAppointmentDocuments);
  const addAppointmentDocument = useAppStore((s) => s.addAppointmentDocument);
  const removeAppointmentDocument = useAppStore((s) => s.removeAppointmentDocument);

  useEffect(() => {
    if (visible && appt) {
      loadAppointmentDocuments(appt.id);
    }
  }, [visible, appt?.id]);

  const dismissPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) onClose(); },
    })
  ).current;

  if (!appt) return null;

  const dateObj = new Date(appt.date + "T12:00");
  const dateLabel = format(dateObj, "PPP", { locale: getDateLocale() });
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const isPast = appt.date < new Date().toISOString().slice(0, 10);

  const reminderLabel =
    appt.reminderMinutes && appt.reminderMinutes > 0
      ? REMINDER_MINUTES.find((r) => r.minutes === appt.reminderMinutes)?.key
      : null;

  const hasCoords = !!appt.locationCoords;
  const coords = appt.locationCoords;

  const mapsUrl = coords
    ? `https://maps.google.com/maps?q=${coords.latitude},${coords.longitude}`
    : null;

  const handleOpenMaps = () => {
    if (!mapsUrl) return;
    const nativeUrl =
      Platform.OS === "ios"
        ? `maps://maps.apple.com/?q=${coords!.latitude},${coords!.longitude}`
        : `geo:${coords!.latitude},${coords!.longitude}?q=${coords!.latitude},${coords!.longitude}(${encodeURIComponent(appt.title)})`;

    Linking.canOpenURL(nativeUrl)
      .then((supported) => Linking.openURL(supported ? nativeUrl : mapsUrl!))
      .catch(() => Linking.openURL(mapsUrl!));
  };

  const handleShare = async () => {
    if (!mapsUrl) return;
    const message = [
      appt.title,
      appt.doctor ? `${t("appointments.fieldDoctor").replace(" (optional)", "")}: ${appt.doctor}` : null,
      `${dateLabelCap}${appt.time ? ` · ${formatTimeForDisplay(appt.time)}` : ""}`,
      appt.location ? appt.location : null,
      mapsUrl,
    ]
      .filter(Boolean)
      .join("\n");

    await Share.share({ message });
  };

  const handleDelete = () => {
    Alert.alert(
      t("appointments.deleteTitle"),
      t("appointments.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDelete(appt);
          },
        },
      ]
    );
  };

  // ─── Document handlers ──────────────────────────────────────────────────

  async function handleAttachDocument() {
    if (!appt) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      await addAppointmentDocument(appt.id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? undefined,
        size: asset.size ?? undefined,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert(t("appointments.docPickerError"));
    }
  }

  async function handleOpenDocument(fileUri: string, mimeType: string) {
    try {
      if (Platform.OS === "android") {
        const contentUri = await getContentUriAsync(fileUri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          type: mimeType,
          flags: 1,
        });
      } else {
        await Sharing.shareAsync(fileUri, { mimeType });
      }
    } catch {
      // Fallback to share sheet if no viewer is available
      try {
        await Sharing.shareAsync(fileUri, { mimeType });
      } catch {
        Alert.alert(t("appointments.docOpenError"));
      }
    }
  }

  function handleDeleteDocument(docId: string) {
    Alert.alert(
      t("appointments.deleteDocTitle"),
      t("appointments.deleteDocMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            removeAppointmentDocument(docId);
          },
        },
      ]
    );
  }

  function formatFileSize(bytes?: number): string {
    if (bytes == null) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const borderColor = theme.isDark ? "#1e293b" : "#e2e8f0";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.isDark ? "#0f172a" : "#ffffff",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "90%",
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }} {...dismissPan.panHandlers}>
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: theme.isDark ? "#334155" : "#cbd5e1",
                borderRadius: 2,
              }}
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Title row ──────────────────────────────────────── */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 16,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: theme.isDark ? "#1e3a5f" : "#dbeafe",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="calendar" size={24} color="#4f9cff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.isDark ? "#f8fafc" : "#1e293b",
                    fontWeight: "900",
                    fontSize: 18,
                    lineHeight: 24,
                  }}
                >
                  {appt.title}
                </Text>
                {isPast && (
                  <View
                    style={{
                      marginTop: 4,
                      alignSelf: "flex-start",
                      backgroundColor: theme.isDark ? "#1e293b" : "#f1f5f9",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ color: theme.muted, fontSize: 11, fontWeight: "600" }}>
                      Past
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  padding: 6,
                  borderRadius: 12,
                  backgroundColor: theme.isDark ? "#1e293b" : "#f1f5f9",
                }}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={theme.muted}
                />
              </TouchableOpacity>
            </View>

            {/* ── Detail rows ─────────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <DetailRow
                icon="calendar-outline"
                label={t("appointments.fieldDate")}
                value={`${dateLabelCap}${appt.time ? `  ·  ${formatTimeForDisplay(appt.time)}` : ""}`}
                color="#4f9cff"
              />

              {appt.doctor ? (
                <DetailRow
                  icon="person-outline"
                  label={t("appointments.fieldDoctor").replace(" (optional)", "")}
                  value={appt.doctor}
                  color="#a855f7"
                />
              ) : null}

              {appt.location ? (
                <DetailRow
                  icon="location-outline"
                  label={t("appointments.fieldLocation").replace(" (optional)", "")}
                  value={appt.location}
                  color="#22c55e"
                />
              ) : null}

              {appt.notes ? (
                <DetailRow
                  icon="document-text-outline"
                  label={t("appointments.fieldNotes").replace(" (optional)", "")}
                  value={appt.notes}
                  color="#f59e0b"
                />
              ) : null}

              {reminderLabel ? (
                <DetailRow
                  icon="notifications-outline"
                  label={t("appointments.fieldReminder")}
                  value={t(`appointments.${reminderLabel}`)}
                  color="#4f9cff"
                />
              ) : null}
            </View>

            {/* ── Embedded map ──────────────────────────────────────── */}
            {hasCoords && coords ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                <TouchableOpacity onPress={handleOpenMaps} activeOpacity={0.85}>
                  <View
                    style={{
                      borderRadius: 20,
                      overflow: "hidden",
                      height: 200,
                      borderWidth: 1,
                      borderColor: borderColor,
                    }}
                  >
                    <MapView
                      style={{ flex: 1 }}
                      initialRegion={{
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        latitudeDelta: 0.008,
                        longitudeDelta: 0.008,
                      }}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                      customMapStyle={theme.isDark ? [] : []}
                      pointerEvents="none"
                    >
                      <Marker
                        coordinate={coords}
                        pinColor="#4f9cff"
                      />
                    </MapView>

                    {/* Tap overlay badge */}
                    <View
                      style={{
                        position: "absolute",
                        bottom: 10,
                        right: 10,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons name="open-outline" size={12} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>
                        {t("appointments.viewOnMap")}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Share location */}
                <TouchableOpacity
                  onPress={handleShare}
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: borderColor,
                    backgroundColor: theme.card,
                  }}
                >
                  <Ionicons name="share-outline" size={16} color="#4f9cff" />
                  <Text style={{ color: "#4f9cff", fontWeight: "700", fontSize: 13 }}>
                    {t("appointments.shareLocation")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* ── Documents section ─────────────────────────────────── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="attach-outline" size={18} color={theme.isDark ? "#94a3b8" : "#64748b"} />
                  <Text style={{ color: theme.isDark ? "#f8fafc" : "#1e293b", fontWeight: "700", fontSize: 14 }}>
                    {t("appointments.documentsTitle")}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleAttachDocument}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: theme.isDark ? "#1e3a5f" : "#dbeafe",
                  }}
                >
                  <Ionicons name="add" size={16} color="#4f9cff" />
                  <Text style={{ color: "#4f9cff", fontWeight: "600", fontSize: 12 }}>
                    {t("appointments.attachDocument")}
                  </Text>
                </TouchableOpacity>
              </View>

              {appointmentDocuments.length === 0 ? (
                <Text style={{ color: theme.muted, fontSize: 13, fontStyle: "italic", paddingVertical: 8 }}>
                  {t("appointments.noDocuments")}
                </Text>
              ) : (
                appointmentDocuments.map((doc) => (
                  <View
                    key={doc.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: borderColor,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: theme.isDark ? "#1e293b" : "#f1f5f9",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={doc.mimeType.startsWith("image/") ? "image-outline" : "document-outline"}
                        size={18}
                        color={theme.isDark ? "#94a3b8" : "#64748b"}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => handleOpenDocument(doc.fileUri, doc.mimeType)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.isDark ? "#f8fafc" : "#1e293b", fontSize: 13, fontWeight: "600" }}
                      >
                        {doc.fileName}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>
                        {formatFileSize(doc.fileSize)}
                        {doc.fileSize ? " · " : ""}
                        {format(new Date(doc.createdAt), "PP", { locale: getDateLocale() })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteDocument(doc.id)}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* ── Edit / Delete actions ─────────────────────────────── */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: Platform.OS === "ios" ? 40 : 28,
                flexDirection: "row",
                gap: 12,
              }}
            >
              <TouchableOpacity
                onPress={handleDelete}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.isDark ? "#7f1d1d" : "#fca5a5",
                  backgroundColor: theme.isDark ? "#450a0a" : "#fff1f2",
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 14 }}>
                  {t("common.delete")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onEdit(appt);
                }}
                style={{
                  flex: 2,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: "#4f9cff",
                }}
              >
                <Ionicons name="pencil-outline" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  {t("common.edit")}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
