import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import MapView, { Marker, Region, MapPressEvent } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { LocationCoords } from "../src/types";

// Dark-mode tile style for Google Maps on Android
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c3f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d2c3f" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#344f6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6ea6b0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#243a52" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a0b4c4" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2e4e6e" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#223244" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1d2e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e729a" }] },
];

interface Props {
  visible: boolean;
  initial?: LocationCoords;
  onConfirm: (coords: LocationCoords) => void;
  onClose: () => void;
}

const DEFAULT_REGION: Region = {
  // Default to Buenos Aires — adjust if needed
  latitude: -34.603_7,
  longitude: -58.381_5,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function LocationPickerModal({ visible, initial, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const mapRef = useRef<MapView>(null);
  const [pin, setPin] = useState<LocationCoords | null>(initial ?? null);
  const [locating, setLocating] = useState(false);

  // Derived inline colours (NativeWind tokens aren't available in style props)
  const colors = {
    background: theme.isDark ? "#0f172a" : "#f8fafc",
    card: theme.card,
    border: theme.isDark ? "#1e293b" : "#e2e8f0",
    text: theme.isDark ? "#f8fafc" : "#1e293b",
    muted: theme.isDark ? "#94a3b8" : "#64748b",
  };

  const initialRegion: Region = initial
    ? { ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  const handleMapPress = (e: MapPressEvent) => {
    const coords: LocationCoords = {
      latitude: e.nativeEvent.coordinate.latitude,
      longitude: e.nativeEvent.coordinate.longitude,
    };
    setPin(coords);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLocateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("appointments.locationPermTitle"),
          t("appointments.locationPermDenied")
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords: LocationCoords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setPin(coords);
      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 },
        500
      );
    } catch {
      Alert.alert(t("appointments.locationPermTitle"), t("appointments.locationPermDenied"));
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = () => {
    if (!pin) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(pin);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* ── Header ─────────────────────────────────────── */}
        <View
          style={{
            paddingTop: Platform.OS === "ios" ? 56 : 48,
            paddingHorizontal: 20,
            paddingBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
              {t("appointments.locationPickerTitle")}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 1 }}>
              {t("appointments.locationPickerSubtitle")}
            </Text>
          </View>
        </View>

        {/* ── Map ──────────────────────────────────────────── */}
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={initialRegion}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
            customMapStyle={theme.isDark ? DARK_MAP_STYLE : []}
          >
            {pin && (
              <Marker
                coordinate={pin}
                pinColor="#4f9cff"
              />
            )}
          </MapView>

          {/* Locate-me FAB */}
          <TouchableOpacity
            onPress={handleLocateMe}
            disabled={locating}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 12,
              elevation: 4,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {locating ? (
              <ActivityIndicator size="small" color="#4f9cff" />
            ) : (
              <Ionicons name="navigate" size={22} color="#4f9cff" />
            )}
          </TouchableOpacity>

          {/* Locate-me label */}
          {!locating && (
            <TouchableOpacity
              onPress={handleLocateMe}
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                backgroundColor: theme.card,
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                elevation: 4,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 4,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="locate" size={14} color="#4f9cff" />
              <Text style={{ color: "#4f9cff", fontSize: 13, fontWeight: "700" }}>
                {t("appointments.locateMe")}
              </Text>
            </TouchableOpacity>
          )}

          {/* Pin hint */}
          {!pin && (
            <View
              style={{
                position: "absolute",
                bottom: 24,
                left: 0,
                right: 0,
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.6)",
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="hand-left-outline" size={14} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 13 }}>
                  {t("appointments.locationPickerSubtitle")}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Confirm button ──────────────────────────────── */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: Platform.OS === "ios" ? 36 : 24,
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 10,
          }}
        >
          {pin && (
            <Text
              style={{
                textAlign: "center",
                color: colors.muted,
                fontSize: 12,
              }}
            >
              {`${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
            </Text>
          )}
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!pin}
            style={{
              backgroundColor: pin ? "#4f9cff" : "#94a3b8",
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
              {t("appointments.locationPickerConfirm")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
