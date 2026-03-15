import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, Platform, KeyboardAvoidingView, PanResponder, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { format } from "date-fns";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useAppStore } from "../../src/store";
import { Appointment, LocationCoords } from "../../src/types";
import { useTranslation, getDateLocale } from "../../src/i18n";
import { EmptyState } from "../../components/EmptyState";
import { today } from "../../src/utils";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { LocationPickerModal } from "../../components/LocationPickerModal";
import { FlashList } from "@shopify/flash-list";

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
      onPress={onPress}
      className="flex-1 py-2 rounded-xl items-center"
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
        style={{ color: active ? (theme.isDark ? "#f8fafc" : "#1e293b") : theme.muted }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Reminder options ─────────────────────────────────────────────────────

const REMINDER_OPTIONS: { key: string; minutes: number }[] = [
  { key: "reminderNone",  minutes: 0    },
  { key: "reminder1h",   minutes: 60   },
  { key: "reminder2h",   minutes: 120  },
  { key: "reminder1d",   minutes: 1440 },
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
  const isPast = appt.date < today();

  return (
    <TouchableOpacity
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${appt.title}${appt.time ? `, ${appt.time}` : ""}`}
      className={`bg-card rounded-2xl border border-border p-4 mb-3 shadow-sm ${isPast ? "opacity-60" : ""}`}
    >
      <View className="flex-row items-start justify-between">
        {/* Left: icon + info */}
        <View className="flex-row items-start gap-3 flex-1">
          <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center mt-0.5">
            <Ionicons name="calendar" size={20} color="#4f9cff" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-text">{appt.title}</Text>
            <Text className="text-xs text-muted mt-0.5 font-medium">
              {dateLabelCap}{appt.time ? ` · ${appt.time}` : ""}
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
                <Text className="text-xs text-muted" numberOfLines={1}>{appt.location}</Text>
              </View>
            ) : null}
            {!appt.location && appt.locationCoords ? (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Ionicons name="location" size={12} color="#4f9cff" />
                <Text className="text-xs text-primary font-medium">
                  {`${appt.locationCoords.latitude.toFixed(4)}, ${appt.locationCoords.longitude.toFixed(4)}`}
                </Text>
              </View>
            ) : null}
            {appt.notes ? (
              <Text className="text-xs text-muted italic mt-1" numberOfLines={2}>{appt.notes}</Text>
            ) : null}
            {appt.reminderMinutes && appt.reminderMinutes > 0 ? (
              <View className="flex-row items-center gap-1 mt-1">
                <Ionicons name="notifications-outline" size={11} color="#4f9cff" />
                <Text className="text-xs text-primary">
                  {REMINDER_OPTIONS.find((r) => r.minutes === appt.reminderMinutes)
                    ? t(`appointments.${REMINDER_OPTIONS.find((r) => r.minutes === appt.reminderMinutes)!.key}`)
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
            accessibilityLabel={`${t('common.edit')} ${appt.title}`}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEdit(); }}
            className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-xl"
          >
            <Ionicons name="pencil-outline" size={15} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete')} ${appt.title}`}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); }}
            className="p-2 bg-red-50 dark:bg-red-950/30 rounded-xl"
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
    time: appt.time ?? "09:00",
    reminderMinutes: appt.reminderMinutes ?? 0,
  };
}

// ─── Main screen ──────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const appointments = useAppStore((s) => s.appointments);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const addAppointment = useAppStore((s) => s.addAppointment);
  const updateAppointment = useAppStore((s) => s.updateAppointment);
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);
  const pendingEditAppointmentId = useAppStore((s) => s.pendingEditAppointmentId);
  const setPendingEditAppointmentId = useAppStore((s) => s.setPendingEditAppointmentId);
  const setSelectedAppointmentId = useAppStore((s) => s.setSelectedAppointmentId);

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);

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
    return () => { pendingPickerRef.current = false; };
  }, []);

  // Date / Time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
    }, [loadAppointments])
  );

  // ── Respond to pending edit from detail modal ──────────────────────────

  useEffect(() => {
    if (pendingEditAppointmentId && appointments.length > 0) {
      const appt = appointments.find((a) => a.id === pendingEditAppointmentId);
      if (appt) {
        setEditingId(appt.id);
        setForm(formFromAppointment(appt));
        setModalVisible(true);
        setPendingEditAppointmentId(null);
      }
    }
  }, [pendingEditAppointmentId, appointments, setPendingEditAppointmentId]);

  const todayStr = today();
  const upcoming = appointments.filter((a) => a.date >= todayStr);
  const past     = appointments.filter((a) => a.date <  todayStr).reverse();
  const list = tab === "upcoming" ? upcoming : past;

  // ── Form helpers ───────────────────────────────────────────────────────

  const openNew = () => {
    setEditingId(null);
    setForm(defaultForm());
    setModalVisible(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingId(appt.id);
    setForm(formFromAppointment(appt));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setLocationPickerVisible(false);
  };

  const appointmentPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderRelease: (_, { dy }) => { if (dy > 50) closeModal(); },
    })
  ).current;

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert(t("common.error"), t("appointments.errorTitleRequired"));
      return;
    }
    if (!form.date) {
      Alert.alert(t("common.error"), t("appointments.errorDateRequired"));
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: form.title.trim(),
        doctor: form.doctor.trim() || undefined,
        location: form.location.trim() || undefined,
        locationCoords: form.locationCoords,
        notes: form.notes.trim() || undefined,
        date: form.date,
        time: form.time,
        reminderMinutes: form.reminderMinutes,
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
      closeModal();
    } catch {
      Alert.alert(t("common.error"), t("appointments.errorGeneric"));
    } finally {
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
          onPress: () => deleteAppointment(appt.id),
        },
      ]
    );
  };

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
    const [h, m] = form.time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  })();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-black text-text">{t("appointments.title")}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("appointments.newTitle")}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openNew(); }}
          className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
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
        data={list}
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
          <EmptyState
            icon="calendar-outline"
            title={t("appointments.noAppointments")}
            subtitle={tab === "upcoming" ? t("appointments.noAppointmentsSubtitle") : ""}
          />
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
          <Pressable className="flex-1 justify-end bg-black/50" onPress={closeModal}>
            <Pressable onPress={() => {}} className="bg-background rounded-t-3xl">
              {/* Handle */}
              <View className="items-center pt-3 pb-1" {...appointmentPan.panHandlers}>
                <View className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
              </View>

              <ScrollView
                className="px-5"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text className="text-lg font-black text-text mt-3 mb-4">
                  {editingId ? t("appointments.editTitle") : t("appointments.newTitle")}
                </Text>

                {/* Title */}
                <Text className="text-sm font-semibold text-text mb-1.5">{t("appointments.fieldTitle")} <Text className="text-danger">*</Text></Text>
                <TextInput
                  value={form.title}
                  onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                  placeholder={t("appointments.fieldTitlePlaceholder")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-4"
                  autoCapitalize="words"
                />

                {/* Doctor */}
                <Text className="text-sm font-semibold text-text mb-1.5">{t("appointments.fieldDoctor")}</Text>
                <TextInput
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
                {form.locationCoords || form.location ? (
                  /* ── Location set — show address chip + actions ── */
                  <View className="flex-row items-center gap-2 border border-blue-200 dark:border-blue-800 rounded-2xl bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5 mb-4">
                    <Ionicons name="location" size={16} color="#4f9cff" style={{ flexShrink: 0 }} />
                    <Text className="text-primary text-sm font-medium flex-1" numberOfLines={2}>
                      {form.location || `${form.locationCoords!.latitude.toFixed(5)}, ${form.locationCoords!.longitude.toFixed(5)}`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleOpenPicker()}
                      className="p-1"
                    >
                      <Ionicons name="pencil-outline" size={16} color="#4f9cff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setForm((f) => ({ ...f, locationCoords: undefined, location: "" }))}
                      className="p-1"
                    >
                      <Ionicons name="close-circle-outline" size={16} color={theme.muted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* ── No location — single "Pin location" button ── */
                  <TouchableOpacity
                    onPress={() => handleOpenPicker()}
                    className="flex-row items-center justify-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-4"
                  >
                    <Ionicons name="map-outline" size={16} color="#4f9cff" />
                    <Text className="text-primary text-sm font-bold">
                      {t("appointments.pickOnMap")}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Date */}
                <Text className="text-sm font-semibold text-text mb-1.5">{t("appointments.fieldDate")} <Text className="text-danger">*</Text></Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  className="flex-row items-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-1"
                >
                  <Ionicons name="calendar-outline" size={16} color="#4f9cff" />
                  <Text className="text-text font-semibold">
                    {format(new Date(form.date + "T12:00"), "PPP", { locale: getDateLocale() })}
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
                <Text className="text-sm font-semibold text-text mb-1.5">{t("appointments.fieldTime")} <Text className="text-danger">*</Text></Text>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  className="flex-row items-center gap-2 border border-border rounded-2xl px-4 py-3 bg-card mb-4"
                >
                  <Ionicons name="time-outline" size={16} color="#4f9cff" />
                  <Text className="text-text font-semibold">{form.time}</Text>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={timeDateObj}
                    mode="time"
                    is24Hour
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={handleTimeChange}
                  />
                )}

                {/* Reminder */}
                <Text className="text-sm font-semibold text-text mb-2">{t("appointments.fieldReminder")}</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {REMINDER_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setForm((f) => ({ ...f, reminderMinutes: opt.minutes }))}
                      className={`rounded-xl px-3 py-2 border ${
                        form.reminderMinutes === opt.minutes
                          ? "bg-primary border-primary"
                          : "bg-card border-border"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          form.reminderMinutes === opt.minutes ? "text-white" : "text-muted"
                        }`}
                      >
                        {t(`appointments.${opt.key}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes */}
                <Text className="text-sm font-semibold text-text mb-1.5">{t("appointments.fieldNotes")}</Text>
                <TextInput
                  value={form.notes}
                  onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                  placeholder={t("appointments.fieldNotesPlaceholder")}
                  placeholderTextColor={theme.muted}
                  className="border border-border rounded-2xl px-4 py-3 text-text text-base bg-card mb-4"
                  multiline
                  numberOfLines={3}
                />

                {/* Actions */}
                <View className="flex-row gap-3 mb-8">
                  <TouchableOpacity
                    onPress={closeModal}
                    className="flex-1 py-3.5 border border-border rounded-2xl items-center"
                  >
                    <Text className="font-semibold text-muted">{t("common.cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave(); }}
                    disabled={saving}
                    className={`flex-2 flex-1 py-3.5 rounded-2xl items-center ${saving ? "bg-slate-300" : "bg-primary"}`}
                  >
                    <Text className="font-bold text-white">
                      {saving ? t("common.saving") : t("appointments.saveButton")}
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
