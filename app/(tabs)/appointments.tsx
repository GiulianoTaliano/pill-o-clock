import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  PanResponder,
  Pressable,
  ActivityIndicator,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { getContentUriAsync } from "expo-file-system/legacy";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { format } from "date-fns";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useAppStore } from "../../src/store";
import { Appointment, LocationCoords } from "../../src/types";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { EmptyState } from "../../components/EmptyState";
import { today, formatTimeForDisplay } from "../../src/utils";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { LocationPickerModal } from "../../components/LocationPickerModal";
import { FlashList } from "@shopify/flash-list";
import { isAppointmentPast } from "../../src/services/carePlan";
import { getActiveProfileId } from "../../src/services/profileStore";
import { ProfileChip } from "../../components/ProfileChip";

// ─── Sub-tab button ──────────────────────────────────────────────────────

// Extracted as a standalone component so react-native-css-interop's upgrade-
// warning serializer cannot crawl the parent closure and accidentally access
// React Navigation's context getter (which throws outside its own
// NavigationContainer scope). Conditional appearance is expressed via `style`
// instead of NativeWind className to keep it out of the CSS interop path.
function AppointmentSubTabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="flex-1 min-h-[48px] py-3 rounded-xl items-center"
      style={
        active
          ? {
              backgroundColor: theme.card,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 2,
              elevation: 1,
            }
          : undefined
      }
    >
      <Text
        className="text-sm font-bold"
        style={{
          color: active ? (theme.isDark ? "#f8fafc" : "#1e293b") : theme.muted,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Reminder options ─────────────────────────────────────────────────────

const REMINDER_OPTIONS: { key: string; minutes: number }[] = [
  { key: "reminderNone", minutes: 0 },
  { key: "exact", minutes: -1 },
  { key: "reminder1h", minutes: 60 },
  { key: "reminder2h", minutes: 120 },
  { key: "reminder1d", minutes: 1440 },
];

// ─── Appointment card ─────────────────────────────────────────────────────

function AppointmentCard({
  appt,
  onPress,
  onEdit,
  onDelete,
}: {
  appt: Appointment;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const dateObj = new Date(appt.date + "T12:00");
  const dateLabel = format(dateObj, "PPP", { locale: getDateLocale() });
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const isPast = isAppointmentPast(appt);

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${appt.title}, ${dateLabelCap}${
        appt.time ? `, ${formatTimeForDisplay(appt.time)}` : ""
      }`}
      className="bg-card rounded-2xl border border-border p-4 mb-3"
    >
      <View className="flex-row items-start justify-between">
        {/* Left: icon + info */}
        <View className="flex-row items-start gap-3 flex-1">
          <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center mt-0.5">
            <Ionicons name="calendar" size={20} color="#4f9cff" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-text">{appt.title}</Text>
            {isPast && (
              <Text className="text-xs text-muted mt-1">
                {t("uxHealth.past")}
              </Text>
            )}
            <Text className="text-xs text-muted mt-0.5 font-medium">
              {dateLabelCap}
              {appt.time ? ` · ${formatTimeForDisplay(appt.time)}` : ""}
            </Text>
            {appt.doctor ? (
              <View className="flex-row items-center gap-1 mt-1">
                <Ionicons name="person-outline" size={12} color={theme.muted} />
                <Text className="text-xs text-muted">{appt.doctor}</Text>
              </View>
            ) : null}
            {appt.location ? (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Ionicons
                  name={appt.locationCoords ? "location" : "location-outline"}
                  size={12}
                  color={appt.locationCoords ? "#4f9cff" : theme.muted}
                />
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {appt.location}
                </Text>
              </View>
            ) : null}
            {!appt.location && appt.locationCoords ? (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Ionicons name="location" size={12} color="#4f9cff" />
                <Text className="text-xs text-primary font-medium">
                  {`${appt.locationCoords.latitude.toFixed(
                    4
                  )}, ${appt.locationCoords.longitude.toFixed(4)}`}
                </Text>
              </View>
            ) : null}
            {appt.notes ? (
              <Text
                className="text-xs text-muted italic mt-1"
                numberOfLines={2}
              >
                {appt.notes}
              </Text>
            ) : null}
            {appt.reminderMinutes !== 0 && appt.reminderMinutes != null ? (
              <View className="flex-row items-center gap-1 mt-1">
                <Ionicons
                  name="notifications-outline"
                  size={11}
                  color="#4f9cff"
                />
                <Text className="text-xs text-primary">
                  {REMINDER_OPTIONS.find(
                    (r) => r.minutes === appt.reminderMinutes
                  )
                    ? appt.reminderMinutes === -1
                      ? t("uxHealth.reminderExact")
                      : t(
                          `appointments.${
                            REMINDER_OPTIONS.find(
                              (r) => r.minutes === appt.reminderMinutes
                            )!.key
                          }`
                        )
                    : ""}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Actions */}
        <View className="flex-row gap-2 ml-2">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t("common.edit")} ${appt.title}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onEdit();
            }}
            className="min-h-[48px] min-w-[48px] items-center justify-center bg-primary/10 rounded-xl"
          >
            <Ionicons name="pencil-outline" size={15} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t("common.delete")} ${appt.title}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            className="min-h-[48px] min-w-[48px] items-center justify-center rounded-xl"
          >
            <Ionicons name="trash-outline" size={15} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Default form state ───────────────────────────────────────────────────

interface FormState {
  title: string;
  doctor: string;
  location: string;
  locationCoords: LocationCoords | undefined;
  notes: string;
  date: string;
  time: string;
  reminderMinutes: number;
}

function defaultForm(): FormState {
  return {
    title: "",
    doctor: "",
    location: "",
    locationCoords: undefined,
    notes: "",
    date: today(),
    time: "09:00",
    reminderMinutes: 60,
  };
}

function formFromAppointment(appt: Appointment): FormState {
  return {
    title: appt.title,
    doctor: appt.doctor ?? "",
    location: appt.location ?? "",
    locationCoords: appt.locationCoords,
    notes: appt.notes ?? "",
    date: appt.date,
    time: appt.time ?? "",
    reminderMinutes: appt.reminderMinutes ?? 0,
  };
}

// ─── Main screen ──────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const router = useRouter();
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const appointments = useAppStore((s) => s.appointments);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const addAppointment = useAppStore((s) => s.addAppointment);
  const updateAppointment = useAppStore((s) => s.updateAppointment);
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);
  const appointmentDocuments = useAppStore((s) => s.appointmentDocuments);
  const loadAppointmentDocuments = useAppStore(
    (s) => s.loadAppointmentDocuments
  );
  const addAppointmentDocument = useAppStore((s) => s.addAppointmentDocument);
  const removeAppointmentDocument = useAppStore(
    (s) => s.removeAppointmentDocument
  );
  const pendingEditAppointmentId = useAppStore(
    (s) => s.pendingEditAppointmentId
  );
  const setPendingEditAppointmentId = useAppStore(
    (s) => s.setPendingEditAppointmentId
  );
  const setSelectedAppointmentId = useAppStore(
    (s) => s.setSelectedAppointmentId
  );

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const initialFormRef = useRef(JSON.stringify(defaultForm()));
  const saveGuard = useRef(false);
  const closeRef = useRef(() => {});
  const processedDate = useRef<string | null>(null);
  const displayDocuments = appointmentDocuments.filter(
    (d) => d.appointmentId === editingId
  );

  const recentLocations = useMemo(() => {
    const seen = new Set<string>();
    return appointments
      .filter((a) => a.location && a.locationCoords)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .reduce<{ label: string; coords: LocationCoords }[]>((arr, a) => {
        const key = a.location!.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          arr.push({ label: a.location!, coords: a.locationCoords! });
        }
        return arr;
      }, [])
      .slice(0, 10);
  }, [appointments]);

  // iOS: two Modals cannot overlap. When the user taps "Pin on map" while the
  // form modal is visible, we must fully dismiss the form first, then present
  // the map picker. This ref signals that the dismiss was triggered by this
  // flow so we can reopen the form once the picker closes.
  const pendingPickerRef = useRef(false);

  const handleOpenPicker = () => {
    if (Platform.OS === "ios") {
      // Mark intent and hide the form modal — onDismiss will open the picker
      // after the slide-down animation completes.
      pendingPickerRef.current = true;
      setModalVisible(false);
    } else {
      // Android handles stacked modals without issues.
      setLocationPickerVisible(true);
    }
  };

  // Reset the pending-picker flag if the component unmounts while the picker
  // is open (safety guard — normal flow clears it in onClose).
  useEffect(() => {
    return () => {
      pendingPickerRef.current = false;
    };
  }, []);

  // Date / Time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const reload = useCallback(async () => {
    if (getActiveProfileId() !== activeProfileId) return;
    setLoading(true);
    setLoadError(false);
    try {
      await loadAppointments();
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [loadAppointments, activeProfileId]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );
  useEffect(() => {
    if (
      params.date &&
      /^\d{4}-\d{2}-\d{2}$/.test(params.date) &&
      processedDate.current !== params.date
    ) {
      processedDate.current = params.date;
      const next = { ...defaultForm(), date: params.date };
      setEditingId(null);
      setForm(next);
      initialFormRef.current = JSON.stringify(next);
      setFormError(null);
      setModalVisible(true);
      router.setParams({ date: undefined });
    } else if (!params.date) {
      processedDate.current = null;
    }
  }, [params.date, router]);

  // ── Load documents when editing an existing appointment ─────────────

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    setDocsLoading(true);
    setDocsError(false);
    loadAppointmentDocuments(editingId)
      .catch(() => {
        if (!cancelled) setDocsError(true);
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingId, loadAppointmentDocuments]);

  // ── Respond to pending edit from detail modal ──────────────────────────

  useEffect(() => {
    if (pendingEditAppointmentId && appointments.length > 0) {
      const appt = appointments.find((a) => a.id === pendingEditAppointmentId);
      if (appt) {
        setEditingId(appt.id);
        const next = formFromAppointment(appt);
        setForm(next);
        initialFormRef.current = JSON.stringify(next);
        setFormError(null);
        setModalVisible(true);
        setPendingEditAppointmentId(null);
      }
    }
  }, [pendingEditAppointmentId, appointments, setPendingEditAppointmentId]);

  const upcoming = appointments.filter((a) => !isAppointmentPast(a));
  const past = appointments.filter((a) => isAppointmentPast(a)).reverse();
  const list = tab === "upcoming" ? upcoming : past;

  // ── Form helpers ───────────────────────────────────────────────────────

  const openNew = () => {
    setEditingId(null);
    const next = defaultForm();
    setForm(next);
    initialFormRef.current = JSON.stringify(next);
    setFormError(null);
    setModalVisible(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingId(appt.id);
    const next = formFromAppointment(appt);
    setForm(next);
    initialFormRef.current = JSON.stringify(next);
    setFormError(null);
    setModalVisible(true);
  };

  const dismissForm = () => {
    setModalVisible(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setLocationPickerVisible(false);
  };
  const closeModal = () => {
    if (saving) return;
    if (JSON.stringify(form) === initialFormRef.current) {
      dismissForm();
      return;
    }
    Alert.alert(t("uxHealth.discardTitle"), t("uxHealth.discardBody"), [
      { text: t("uxHealth.keepEditing"), style: "cancel" },
      {
        text: t("uxHealth.discard"),
        style: "destructive",
        onPress: dismissForm,
      },
    ]);
  };
  closeRef.current = closeModal;

  const appointmentPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => {
        if (dy > 50) closeRef.current();
      },
    })
  ).current;

  const handleSave = async () => {
    if (saveGuard.current) return;
    if (!form.title.trim()) {
      setFormError(t("appointments.errorTitleRequired"));
      return;
    }
    if (!form.date) {
      setFormError(t("appointments.errorDateRequired"));
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const data = {
        title: form.title.trim(),
        doctor: form.doctor.trim() || undefined,
        location: form.location.trim() || undefined,
        locationCoords: form.locationCoords,
        notes: form.notes.trim() || undefined,
        date: form.date,
        time: form.time || undefined,
        reminderMinutes: form.time ? form.reminderMinutes : 0,
      };
      if (editingId) {
        const existing = appointments.find((a) => a.id === editingId);
        await updateAppointment({
          ...data,
          id: editingId,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        });
      } else {
        await addAppointment(data);
      }
      dismissForm();
      if (data.reminderMinutes !== 0) {
        const saved = useAppStore
          .getState()
          .appointments.find((a) =>
            editingId
              ? a.id === editingId
              : a.title === data.title &&
                a.date === data.date &&
                a.time === data.time
          );
        if (
          !saved?.notificationId &&
          !isAppointmentPast({ date: data.date, time: data.time })
        )
          Alert.alert(
            t("appointments.title"),
            t("uxHealth.reminderNotScheduled")
          );
        else if (form.reminderMinutes > 0 && data.time) {
          const at = new Date(`${data.date}T${data.time}:00`);
          if (
            at.getTime() - form.reminderMinutes * 60000 <= Date.now() &&
            at.getTime() > Date.now()
          )
            Alert.alert(t("appointments.title"), t("uxHealth.reminderTooLate"));
        }
      }
    } catch {
      setFormError(t("uxHealth.saveError"));
    } finally {
      saveGuard.current = false;
      setSaving(false);
    }
  };

  const handleDelete = (appt: Appointment) => {
    Alert.alert(
      t("appointments.deleteTitle"),
      t("appointments.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAppointment(appt.id);
            } catch {
              Alert.alert(t("common.error"), t("uxHealth.deleteError"));
            }
          },
        },
      ]
    );
  };

  // ─── Document handlers (edit form) ──────────────────────────────────────

  async function handleAttachEditDocument() {
    if (!editingId) return;
    if (attaching) return;
    setAttaching(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      await addAppointmentDocument(editingId, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? undefined,
        size: asset.size ?? undefined,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert(t("appointments.docPickerError"));
    } finally {
      setAttaching(false);
    }
  }

  async function handleOpenEditDocument(fileUri: string, mimeType: string) {
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

  function handleDeleteEditDocument(docId: string) {
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
            removeAppointmentDocument(docId).catch(() =>
              Alert.alert(t("common.error"), t("uxHealth.deleteError"))
            );
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

  // ── Date / Time picker handlers ────────────────────────────────────────

  const handleDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (date) setForm((f) => ({ ...f, date: format(date, "yyyy-MM-dd") }));
  };

  const handleTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (date) setForm((f) => ({ ...f, time: format(date, "HH:mm") }));
  };

  const timeDateObj = (() => {
    const [h, m] = (form.time || "09:00").split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  })();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-text flex-1">
          {t("appointments.title")}
        </Text>
        <ProfileChip />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("appointments.newTitle")}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openNew();
          }}
          className="bg-action w-12 h-12 rounded-2xl items-center justify-center ml-2"
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-5 mb-3 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
        {(["upcoming", "past"] as const).map((tabKey) => (
          <AppointmentSubTabButton
            key={tabKey}
            active={tab === tabKey}
            label={t(`appointments.${tabKey}`)}
            onPress={() => setTab(tabKey)}
          />
        ))}
      </View>

      <FlashList
        data={loading || loadError ? [] : list}
        renderItem={({ item: appt }) => (
          <AppointmentCard
            key={appt.id}
            appt={appt}
            onPress={() => setSelectedAppointmentId(appt.id)}
            onEdit={() => openEdit(appt)}
            onDelete={() => handleDelete(appt)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color={theme.primary} />
              <Text className="text-muted mt-3">{t("uxHealth.loading")}</Text>
            </View>
          ) : loadError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title={t("uxHealth.loadError")}
              actionLabel={t("uxHealth.retry")}
              onAction={() => void reload()}
            />
          ) : (
            <EmptyState
              illustration="obAppointments"
              title={t("appointments.noAppointments")}
              subtitle={
                tab === "upcoming"
                  ? t("appointments.noAppointmentsSubtitle")
                  : ""
              }
              actionLabel={
                tab === "upcoming" ? t("appointments.newTitle") : undefined
              }
              onAction={tab === "upcoming" ? openNew : undefined}
            />
          )
        }
        ListFooterComponent={<View className="h-6" />}
      />

      {/* Add / Edit modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
        onDismiss={() => {
          // iOS-only: fires after the dismiss animation completes.
          // If the user tapped "Pin on map", open the map picker now that the
          // form modal is fully gone (iOS forbids two overlapping Modals).
          if (pendingPickerRef.current) {
            setLocationPickerVisible(true);
          }
        }}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            className="flex-1 justify-end bg-black/50"
            onPress={closeModal}
          >
            <Pressable
              onPress={() => {}}
              className="bg-background rounded-t-3xl max-h-[90%]"
            >
              {/* Handle */}
              <View
                className="items-center pt-3 pb-1"
                {...appointmentPan.panHandlers}
              >
                <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
              </View>

              <ScrollView
                className="px-5"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text className="text-lg font-black text-text mt-3 mb-4">
                  {editingId
                    ? t("appointments.editTitle")
                    : t("appointments.newTitle")}
                </Text>

                {/* Title */}
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("appointments.fieldTitle")}{" "}
                  <Text className="text-danger">*</Text>
                </Text>
                <TextInput
                  accessibilityLabel={t("appointments.fieldTitle")}
                  value={form.title}
                  onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                  placeholder={t("appointments.fieldTitlePlaceholder")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-4"
                  autoCapitalize="words"
                />

                {/* Doctor */}
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("appointments.fieldDoctor")}
                </Text>
                <TextInput
                  accessibilityLabel={t("appointments.fieldDoctor")}
                  value={form.doctor}
                  onChangeText={(v) => setForm((f) => ({ ...f, doctor: v }))}
                  placeholder={t("appointments.fieldDoctorPlaceholder")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-4"
                  autoCapitalize="words"
                />

                {/* Location */}
                {/* Location */}
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("appointments.fieldLocation")}
                </Text>
                <TextInput
                  accessibilityLabel={t("uxHealth.manualAddress")}
                  value={form.location}
                  onChangeText={(location) =>
                    setForm((f) => ({
                      ...f,
                      location,
                      locationCoords: undefined,
                    }))
                  }
                  placeholder={t("uxHealth.manualAddress")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-3"
                />
                {form.locationCoords ? (
                  /* ── Location set — show address chip + actions ── */
                  <View className="flex-row items-center gap-2 border border-blue-200 dark:border-blue-800 rounded-2xl bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5 mb-4">
                    <Ionicons
                      name="location"
                      size={16}
                      color="#4f9cff"
                      style={{ flexShrink: 0 }}
                    />
                    <Text
                      className="text-primary text-sm font-medium flex-1"
                      numberOfLines={2}
                    >
                      {form.location ||
                        `${form.locationCoords!.latitude.toFixed(
                          5
                        )}, ${form.locationCoords!.longitude.toFixed(5)}`}
                    </Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("appointments.pickOnMap")}
                      onPress={() => handleOpenPicker()}
                      className="min-h-[48px] min-w-[48px] items-center justify-center"
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={16}
                        color="#4f9cff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("uxHealth.pinClear")}
                      onPress={() =>
                        setForm((f) => ({ ...f, locationCoords: undefined }))
                      }
                      className="min-h-[48px] min-w-[48px] items-center justify-center"
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={16}
                        color={theme.muted}
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* ── No location — single "Pin location" button ── */
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => handleOpenPicker()}
                    className="flex-row items-center justify-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-4"
                  >
                    <Ionicons name="map-outline" size={16} color="#4f9cff" />
                    <Text className="text-primary text-sm font-bold">
                      {t("uxHealth.optionalMap")}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Date */}
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("appointments.fieldDate")}{" "}
                  <Text className="text-danger">*</Text>
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("appointments.fieldDate")}
                  onPress={() => setShowDatePicker(true)}
                  className="flex-row items-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-1"
                >
                  <Ionicons name="calendar-outline" size={16} color="#4f9cff" />
                  <Text className="text-text font-semibold">
                    {format(new Date(form.date + "T12:00"), "PPP", {
                      locale: getDateLocale(),
                    })}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={new Date(form.date + "T12:00")}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleDateChange}
                  />
                )}

                {/* Time */}
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("appointments.fieldTime")}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("appointments.fieldTime")}
                  onPress={() => setShowTimePicker(true)}
                  className="flex-row items-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-4"
                >
                  <Ionicons name="time-outline" size={16} color="#4f9cff" />
                  <Text className="text-text font-semibold">
                    {form.time
                      ? formatTimeForDisplay(form.time)
                      : t("uxHealth.noTime")}
                  </Text>
                </TouchableOpacity>
                {!!form.time && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() =>
                      setForm((f) => ({ ...f, time: "", reminderMinutes: 0 }))
                    }
                    className="min-h-[48px] justify-center mb-3"
                  >
                    <Text className="text-primary">{t("uxHealth.noTime")}</Text>
                  </TouchableOpacity>
                )}
                {showTimePicker && (
                  <DateTimePicker
                    value={timeDateObj}
                    mode="time"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleTimeChange}
                  />
                )}

                {/* Reminder */}
                <Text className="text-sm font-semibold text-text mb-2">
                  {t("appointments.fieldReminder")}
                </Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {REMINDER_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: form.reminderMinutes === opt.minutes,
                      }}
                      onPress={() =>
                        setForm((f) => ({ ...f, reminderMinutes: opt.minutes }))
                      }
                      className={`min-h-[48px] justify-center rounded-xl px-3 py-2 border ${
                        form.reminderMinutes === opt.minutes
                          ? "bg-action border-primary"
                          : "bg-card border-border"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          form.reminderMinutes === opt.minutes
                            ? "text-white"
                            : "text-muted"
                        }`}
                      >
                        {opt.minutes === 0
                          ? t("uxHealth.noNotifications")
                          : opt.minutes === -1
                          ? t("uxHealth.reminderExact")
                          : t(`appointments.${opt.key}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes */}
                <Text className="text-sm font-semibold text-text mb-1.5">
                  {t("appointments.fieldNotes")}
                </Text>
                <TextInput
                  accessibilityLabel={t("appointments.fieldNotes")}
                  value={form.notes}
                  onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                  placeholder={t("appointments.fieldNotesPlaceholder")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-4"
                  multiline
                  numberOfLines={3}
                />

                {/* Documents (only when editing an existing appointment) */}
                {editingId && (
                  <View className="mb-4">
                    <Text className="text-sm text-muted mb-3 leading-5">
                      {t("uxHealth.documentsImmediate")}
                    </Text>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons
                          name="attach-outline"
                          size={16}
                          color={theme.muted}
                        />
                        <Text className="text-sm font-semibold text-text">
                          {t("appointments.documentsTitle")}
                        </Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        disabled={attaching}
                        onPress={handleAttachEditDocument}
                        className="min-h-[48px] flex-row items-center gap-1 px-3 py-2 rounded-xl bg-primary/10"
                      >
                        <Ionicons name="add" size={14} color={theme.primary} />
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: theme.primary }}
                        >
                          {t(
                            attaching
                              ? "uxHealth.attaching"
                              : "appointments.attachDocument"
                          )}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {docsLoading ? (
                      <ActivityIndicator color={theme.primary} />
                    ) : docsError ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={async () => {
                          setDocsLoading(true);
                          setDocsError(false);
                          try {
                            await loadAppointmentDocuments(editingId);
                          } catch {
                            setDocsError(true);
                          } finally {
                            setDocsLoading(false);
                          }
                        }}
                        className="min-h-[48px] justify-center"
                      >
                        <Text className="text-danger">
                          {t("uxHealth.loadError")} · {t("uxHealth.retry")}
                        </Text>
                      </TouchableOpacity>
                    ) : displayDocuments.length === 0 ? (
                      <Text className="text-xs text-muted italic py-1">
                        {t("appointments.noDocuments")}
                      </Text>
                    ) : (
                      displayDocuments.map((doc) => (
                        <View
                          key={doc.id}
                          className="flex-row items-center py-2.5 border-b border-border gap-2.5"
                        >
                          <View className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center">
                            <Ionicons
                              name={
                                doc.mimeType.startsWith("image/")
                                  ? "image-outline"
                                  : "document-outline"
                              }
                              size={16}
                              color={theme.muted}
                            />
                          </View>
                          <TouchableOpacity
                            accessibilityRole="button"
                            onPress={() =>
                              handleOpenEditDocument(doc.fileUri, doc.mimeType)
                            }
                            className="flex-1 min-h-[48px] justify-center"
                          >
                            <Text
                              className="text-sm font-semibold text-text"
                              numberOfLines={1}
                            >
                              {doc.fileName}
                            </Text>
                            <Text className="text-xs text-muted">
                              {formatFileSize(doc.fileSize)}
                              {doc.fileSize ? " · " : ""}
                              {format(new Date(doc.createdAt), "PP", {
                                locale: getDateLocale(),
                              })}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={t("uxHealth.deleteDocument", {
                              name: doc.fileName,
                            })}
                            onPress={() => handleDeleteEditDocument(doc.id)}
                            className="min-h-[48px] min-w-[48px] items-center justify-center"
                          >
                            <Ionicons
                              name="trash-outline"
                              size={15}
                              color="#ef4444"
                            />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {formError && (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    className="text-danger text-sm mb-4"
                  >
                    {formError}
                  </Text>
                )}
                {!editingId && (
                  <Text className="text-sm text-muted mb-4">
                    {t("uxHealth.attachAfterSave")}
                  </Text>
                )}
                {/* Actions */}
                <View
                  className="flex-row gap-3"
                  style={{ marginBottom: Math.max(insets.bottom, 16) + 12 }}
                >
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={closeModal}
                    className="flex-1 py-3.5 border border-border rounded-2xl items-center"
                  >
                    <Text className="font-semibold text-muted">
                      {t("common.cancel")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{ busy: saving, disabled: saving }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      handleSave();
                    }}
                    disabled={saving}
                    className={`flex-1 min-h-[48px] py-3.5 rounded-2xl items-center ${
                      saving ? "bg-slate-500" : "bg-action"
                    }`}
                  >
                    <Text className="font-bold text-white">
                      {saving
                        ? t("common.saving")
                        : t("appointments.saveButton")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Location picker — fullscreen map */}
      <LocationPickerModal
        visible={locationPickerVisible}
        initial={form.locationCoords}
        initialAddress={form.location}
        recentLocations={recentLocations}
        onConfirm={(coords, address) => {
          setForm((f) => ({
            ...f,
            locationCoords: coords,
            location: address ?? f.location,
          }));
        }}
        onClose={() => {
          setLocationPickerVisible(false);
          // iOS: reopen the form modal that was hidden to show this picker.
          if (pendingPickerRef.current) {
            pendingPickerRef.current = false;
            setModalVisible(true);
          }
        }}
      />
    </SafeAreaView>
  );
}
