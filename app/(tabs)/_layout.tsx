import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../../src/i18n";
import { useAppStore } from "../../src/store";
import { AppointmentDetailModal } from "../../components/AppointmentDetailModal";
import { Appointment } from "../../src/types";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function TabIcon({
  name,
  focused,
  color,
}: {
  name: IconName;
  focused: boolean;
  color: string;
}) {
  return (
    <View className="items-center justify-center pt-1">
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const appointments = useAppStore((s) => s.appointments);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const selectedAppointmentId = useAppStore((s) => s.selectedAppointmentId);
  const setSelectedAppointmentId = useAppStore((s) => s.setSelectedAppointmentId);
  const setPendingEditAppointmentId = useAppStore((s) => s.setPendingEditAppointmentId);
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);

  // Cold-start: ensure appointments are loaded even when the app is opened
  // directly from a notification (before the Appointments tab is ever visited)
  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  const selectedAppt = appointments.find((a) => a.id === selectedAppointmentId) ?? null;

  const handleEdit = (appt: Appointment) => {
    setSelectedAppointmentId(null);
    setPendingEditAppointmentId(appt.id);
    router.push("/(tabs)/appointments");
  };

  const handleDelete = (appt: Appointment) => {
    deleteAppointment(appt.id);
    setSelectedAppointmentId(null);
  };

  return (
    <>
      <AppointmentDetailModal
        appt={selectedAppt}
        visible={!!selectedAppt}
        onClose={() => setSelectedAppointmentId(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4f9cff",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          height: 65,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? "today" : "today-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.agenda'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? "calendar" : "calendar-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: t('tabs.medications'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? "medkit" : "medkit-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: t('tabs.health'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "heart" : "heart-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "settings" : "settings-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
    </>
  );
}
