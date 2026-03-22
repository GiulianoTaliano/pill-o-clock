import React, {
  useState, useRef, useEffect, useCallback, useMemo, Component,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  ScrollView,
  Keyboard,
} from "react-native";
// PROVIDER_GOOGLE forces Google Maps tiles on both platforms.
// On Android this is already the default; on iOS it replaces Apple Maps,
// which is necessary for:
//   • customMapStyle (dark-mode tile styling) — Apple Maps ignores this prop.
//   • Visual consistency between platforms.
// Requires the react-native-maps config plugin to inject the iOS API key
// (see app.json plugins → react-native-maps → iosGoogleMapsApiKey).
import MapView, { Region, PROVIDER_GOOGLE } from "react-native-maps";

// ─── Map error boundary ────────────────────────────────────────────────────
// Catches native-bridge errors thrown by react-native-maps when the Google
// Maps API key is missing or invalid and shows a friendly fallback.
class MapErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import i18n from "i18next";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { LocationCoords } from "../src/types";
import { GOOGLE_MAPS_API_KEY } from "../src/config";

// Dark-mode tile style for Google Maps (Android + iOS via PROVIDER_GOOGLE).
// Apple Maps ignores customMapStyle entirely, which is why we force PROVIDER_GOOGLE
// on iOS so that dark mode renders consistently on both platforms.
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

// ─── Types & helpers ───────────────────────────────────────────────────────

interface Prediction {
  place_id: string;
  description: string;
  /** Pre-resolved coords (available for Geocoding API fallback results). */
  coords?: LocationCoords;
}

function buildAddressFromGeocode(r: Location.LocationGeocodedAddress): string {
  const parts: string[] = [];
  if (r.name && !/^\d+$/.test(r.name)) parts.push(r.name);
  if (r.street) {
    const streetFull = r.streetNumber ? `${r.street} ${r.streetNumber}` : r.street;
    if (!parts.includes(streetFull)) parts.push(streetFull);
  }
  if (r.city && r.city !== r.name) parts.push(r.city);
  if (r.region && r.region !== r.city) parts.push(r.region);
  if (r.country) parts.push(r.country);
  return parts.join(", ");
}

export interface RecentLocation {
  label: string;
  coords: LocationCoords;
}

interface Props {
  visible: boolean;
  initial?: LocationCoords;
  recentLocations?: RecentLocation[];
  onConfirm: (coords: LocationCoords, address?: string) => void;
  onClose: () => void;
}

const DEFAULT_REGION: Region = {
  // Default to Buenos Aires — adjust if needed
  latitude: -34.603_7,
  longitude: -58.381_5,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function LocationPickerModal({ visible, initial, recentLocations = [], onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const mapRef = useRef<MapView>(null);

  // ── State ────────────────────────────────────────────────────────────────
  const [pin, setPin] = useState<LocationCoords>(
    initial ?? { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude }
  );
  const [pinAddress, setPinAddress] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTyping = useRef(false);
  const mounted = useRef(true);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
    };
  }, []);
  const [inputFocused, setInputFocused] = useState(false);
  const filteredRecents = useMemo(() => {
    if (!recentLocations.length) return [];
    if (searchText.trim().length === 0) return recentLocations.slice(0, 5);
    const lower = searchText.toLowerCase();
    return recentLocations.filter((r) => r.label.toLowerCase().includes(lower)).slice(0, 3);
  }, [recentLocations, searchText]);

  // ── Derived colours ───────────────────────────────────────────────────────
  const colors = {
    background: theme.isDark ? "#0f172a" : "#f8fafc",
    card: theme.card,
    border: theme.isDark ? "#1e293b" : "#e2e8f0",
    text: theme.isDark ? "#f8fafc" : "#1e293b",
    muted: theme.muted,
    inputBg: theme.isDark ? "#1e293b" : "#ffffff",
  };

  const initialRegion: Region = initial
    ? { ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  // ── Seed search text whenever the picker opens ────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const startCoords = initial ?? { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude };
    setPin(startCoords);
    setSuggestions([]);
    setInputFocused(false);
    userTyping.current = false;
    if (initial) {
      Location.reverseGeocodeAsync(initial)
        .then((results) => {
          if (!mounted.current) return;
          const addr = results[0] ? buildAddressFromGeocode(results[0]) : "";
          setPinAddress(addr);
          setSearchText(addr);
        })
        .catch(() => {});
    } else {
      setPinAddress("");
      setSearchText("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Google Places Autocomplete (with Geocoding fallback) ───────────────────
  const fetchAutocomplete = useCallback(async (input: string) => {
    if (input.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearchLoading(true);
    const lang = i18n.language ?? "en";
    let results: Prediction[] = [];

    // 1) Try Google Places Autocomplete
    try {
      const bias = `&location=${pin.latitude},${pin.longitude}&radius=50000`;
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(input)}${bias}&language=${lang}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json() as { status: string; predictions: Prediction[] };
      if (json.status === "OK" && json.predictions.length > 0) {
        results = json.predictions;
      }
    } catch { /* fall through to geocoding fallback */ }

    // 2) Fallback: Google Geocoding API (returns fewer results but works with
    //    API keys that don't have the Places API enabled).
    if (results.length === 0) {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/geocode/json` +
          `?address=${encodeURIComponent(input)}&language=${lang}&key=${GOOGLE_MAPS_API_KEY}`;
        const res = await fetch(url);
        const json = await res.json() as {
          status: string;
          results: Array<{
            place_id: string;
            formatted_address: string;
            geometry: { location: { lat: number; lng: number } };
          }>;
        };
        if (json.status === "OK") {
          results = json.results.slice(0, 5).map((r) => ({
            place_id: r.place_id,
            description: r.formatted_address,
            coords: { latitude: r.geometry.location.lat, longitude: r.geometry.location.lng },
          }));
        }
      } catch { /* leave results empty */ }
    }

    if (mounted.current) {
      setSuggestions(results);
      setSearchLoading(false);
    }
  }, [pin]);

  const handleSearchChange = (text: string) => {
    userTyping.current = true;
    setSearchText(text);
    setSuggestions([]);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (text.trim().length >= 2) {
      searchDebounce.current = setTimeout(() => fetchAutocomplete(text), 350);
    }
  };

  const handleSelectSuggestion = async (pred: Prediction) => {
    userTyping.current = false;
    setSuggestions([]);
    setInputFocused(false);
    setSearchText(pred.description);
    setPinAddress(pred.description);
    Keyboard.dismiss();

    // If the prediction already carries coords (Geocoding fallback), use them directly.
    if (pred.coords) {
      setPin(pred.coords);
      mapRef.current?.animateToRegion(
        { ...pred.coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400,
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    // Otherwise resolve coords via Place Details.
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${pred.place_id}&fields=geometry&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json() as {
        status: string;
        result?: { geometry?: { location?: { lat: number; lng: number } } };
      };
      if (json.status === "OK" && json.result?.geometry?.location) {
        const loc = json.result.geometry.location;
        const coords: LocationCoords = { latitude: loc.lat, longitude: loc.lng };
        setPin(coords);
        mapRef.current?.animateToRegion(
          { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400,
        );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch { /* leave text unchanged */ }
  };

  // ── Select a recent location ─────────────────────────────────────────────
  const handleSelectRecent = (recent: RecentLocation) => {
    userTyping.current = false;
    setSuggestions([]);
    setInputFocused(false);
    setSearchText(recent.label);
    setPinAddress(recent.label);
    setPin(recent.coords);
    Keyboard.dismiss();
    mapRef.current?.animateToRegion(
      { ...recent.coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400,
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Input focus handlers ─────────────────────────────────────────────────
  const handleInputFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setInputFocused(true);
    userTyping.current = true;
  };

  const handleInputBlur = () => {
    userTyping.current = false;
    blurTimeout.current = setTimeout(() => {
      if (mounted.current) setInputFocused(false);
    }, 200);
  };

  // ── Reverse-geocode on map drag (debounced, 700ms) ────────────────────────
  const handleRegionChangeComplete = (region: Region) => {
    const coords: LocationCoords = { latitude: region.latitude, longitude: region.longitude };
    setPin(coords);
    if (reverseDebounce.current) clearTimeout(reverseDebounce.current);
    reverseDebounce.current = setTimeout(async () => {
      if (!mounted.current || userTyping.current) return;
      setReverseGeocoding(true);
      try {
        const results = await Location.reverseGeocodeAsync(coords);
        if (!mounted.current || userTyping.current) return;
        const addr = results[0] ? buildAddressFromGeocode(results[0]) : "";
        setPinAddress(addr);
        setSearchText(addr);
      } catch { /* leave text unchanged */ }
      finally { if (mounted.current) setReverseGeocoding(false); }
    }, 700);
  };

  // ── My location ───────────────────────────────────────────────────────────
  const handleLocateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("appointments.locationPermTitle"), t("appointments.locationPermDenied"));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords: LocationCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setPin(coords);
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 500);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const results = await Location.reverseGeocodeAsync(coords);
      if (mounted.current && results[0]) {
        const addr = buildAddressFromGeocode(results[0]);
        setPinAddress(addr);
        setSearchText(addr);
      }
    } catch {
      Alert.alert(t("appointments.locationPermTitle"), t("appointments.locationPermDenied"));
    } finally {
      if (mounted.current) setLocating(false);
    }
  };

  // ── Confirm (fully synchronous — no async crash risk) ─────────────────────
  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const finalAddress = pinAddress.trim() || searchText.trim() || undefined;
    onConfirm(pin, finalAddress);
    onClose();
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>

        {/* ── Header ──────────────────────────────────────── */}
        <View
          style={{
            paddingTop: Platform.OS === "ios" ? 56 : 48,
            paddingHorizontal: 16,
            paddingBottom: 10,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: 10,
          }}
        >
          {/* Title row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                padding: 8, borderRadius: 12,
                backgroundColor: colors.card,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16, flex: 1 }}>
              {t("appointments.locationPickerTitle")}
            </Text>
          </View>

          {/* Search input */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <TextInput
              value={searchText}
              onChangeText={handleSearchChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder={t("appointments.locationSearchPlaceholder")}
              placeholderTextColor={colors.muted}
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 11 }}
              returnKeyType="search"
              onSubmitEditing={() => fetchAutocomplete(searchText)}
              autoCorrect={false}
            />
            {searchLoading && <ActivityIndicator size="small" color="#4f9cff" />}
            {!searchLoading && searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  userTyping.current = false;
                  setSearchText("");
                  setPinAddress("");
                  setSuggestions([]);
                }}
              >
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Map + overlays ───────────────────────────────── */}
        <View style={{ flex: 1 }}>
          <MapErrorBoundary
            fallback={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
                <Ionicons name="map-outline" size={48} color={colors.muted} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, textAlign: "center" }}>
                  Google Maps API key required
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
                  Set the key in{" "}
                  <Text style={{ fontWeight: "700" }}>src/config.ts</Text>
                  {" "}and{" "}
                  <Text style={{ fontWeight: "700" }}>android/.../strings.xml</Text>.
                  Enable "Maps SDK for Android" + "Places API".
                </Text>
              </View>
            }
          >
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              provider={PROVIDER_GOOGLE}
              initialRegion={initialRegion}
              onRegionChangeComplete={handleRegionChangeComplete}
              showsUserLocation
              showsMyLocationButton={false}
              customMapStyle={theme.isDark ? DARK_MAP_STYLE : []}
            />
          </MapErrorBoundary>

          {/* Fixed crosshair */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <View style={{ transform: [{ translateY: -20 }] }}>
              <Ionicons name="location" size={40} color="#4f9cff" />
            </View>
            <View
              style={{
                width: 10, height: 5, borderRadius: 5,
                backgroundColor: "rgba(0,0,0,0.22)", marginTop: -4,
              }}
            />
          </View>

          {/* Reverse-geocoding spinner */}
          {reverseGeocoding && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute", top: 12, alignSelf: "center",
                backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20,
                paddingHorizontal: 14, paddingVertical: 7,
                flexDirection: "row", alignItems: "center", gap: 6,
              }}
            >
              <ActivityIndicator size="small" color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12 }}>
                {t("appointments.locationLoading")}
              </Text>
            </View>
          )}

          {/* Autocomplete suggestions + recent locations overlay */}
          {(suggestions.length > 0 || (inputFocused && filteredRecents.length > 0)) && (
            <View
              style={{
                position: "absolute", top: 0, left: 12, right: 12,
                backgroundColor: colors.card,
                borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                elevation: 8,
                shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18, shadowRadius: 8,
                maxHeight: 300, overflow: "hidden",
                zIndex: 10,
              }}
            >
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                {/* Recent locations */}
                {inputFocused && filteredRecents.length > 0 && (
                  <>
                    <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {t("appointments.recentLocations")}
                      </Text>
                    </View>
                    {filteredRecents.map((recent, i) => (
                      <TouchableOpacity
                        key={`recent-${i}`}
                        onPress={() => handleSelectRecent(recent)}
                        style={{
                          flexDirection: "row", alignItems: "center",
                          paddingHorizontal: 14, paddingVertical: 11, gap: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        }}
                      >
                        <Ionicons name="time-outline" size={16} color={colors.muted} />
                        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={2}>
                          {recent.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
                {/* Google Places suggestions */}
                {suggestions.map((pred, i) => (
                  <TouchableOpacity
                    key={pred.place_id}
                    onPress={() => handleSelectSuggestion(pred)}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 14, paddingVertical: 12, gap: 10,
                      borderBottomWidth: i < suggestions.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color="#4f9cff" />
                    <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={2}>
                      {pred.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Locate-me FAB */}
          <TouchableOpacity
            onPress={handleLocateMe}
            disabled={locating}
            style={{
              position: "absolute", top: 16, right: 16,
              backgroundColor: colors.card, borderRadius: 16, padding: 12,
              elevation: 4, shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            {locating
              ? <ActivityIndicator size="small" color="#4f9cff" />
              : <Ionicons name="navigate" size={22} color="#4f9cff" />
            }
          </TouchableOpacity>

          {/* Drag hint pill */}
          <View
            pointerEvents="none"
            style={{ position: "absolute", bottom: 20, left: 0, right: 0, alignItems: "center" }}
          >
            <View
              style={{
                backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20,
                paddingHorizontal: 14, paddingVertical: 7,
                flexDirection: "row", alignItems: "center", gap: 6,
              }}
            >
              <Ionicons name="move-outline" size={13} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12 }}>
                {t("appointments.locationPickerSubtitle")}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────── */}
        <View
          style={{
            paddingHorizontal: 20, paddingTop: 14,
            paddingBottom: Platform.OS === "ios" ? 36 : 20,
            backgroundColor: colors.background,
            borderTopWidth: 1, borderTopColor: colors.border,
            gap: 8,
          }}
        >
          {(searchText || pinAddress) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="location" size={13} color="#4f9cff" />
              <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
                {searchText || pinAddress}
              </Text>
            </View>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
              {`${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleConfirm}
            style={{
              backgroundColor: "#4f9cff", borderRadius: 16,
              paddingVertical: 16, alignItems: "center",
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
