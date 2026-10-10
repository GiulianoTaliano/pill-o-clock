import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { useTranslation } from "../src/i18n";
import {
  getAvailableAlarmSounds,
  previewAlarmSound,
  stopSoundPreview,
  setAlarmSound,
  getAlarmSound,
  isAvailable,
} from "expo-alarm";
import type { AlarmSound } from "expo-alarm";
import * as Haptics from "expo-haptics";

// ─── Props ─────────────────────────────────────────────────────────────────

interface AlarmSoundPickerProps {
  /** Maximum visible height (px). The list scrolls beyond this. */
  maxHeight?: number;
  /** Called after the user selects a new sound. */
  onSoundChange?: (sound: AlarmSound) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AlarmSoundPicker({
  maxHeight = 280,
  onSoundChange,
}: AlarmSoundPickerProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  const [sounds, setSounds] = useState<AlarmSound[]>([]);
  const [selectedUri, setSelectedUri] = useState<string>("");
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const playingUriRef = useRef<string | null>(null);

  // Keep ref in sync for cleanup
  useEffect(() => {
    playingUriRef.current = playingUri;
  }, [playingUri]);

  // ── Load sounds + current selection ─────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== "android" || !isAvailable) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const [available, current] = await Promise.all([
          getAvailableAlarmSounds(),
          getAlarmSound(),
        ]);
        setSounds(available);
        setSelectedUri(current.uri);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => {
      // Stop preview on unmount
      if (playingUriRef.current !== null) {
        stopSoundPreview().catch(() => {});
      }
    };
  }, [reload]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    async (sound: AlarmSound) => {
      Haptics.selectionAsync();
      setSaving(true);
      setError(false);

      try {
        await setAlarmSound(sound.uri, sound.title);
        setSelectedUri(sound.uri);
        onSoundChange?.(sound);
      } catch {
        setError(true);
      } finally {
        setSaving(false);
      }
    },
    [onSoundChange]
  );

  const handleTogglePreview = useCallback(async (uri: string) => {
    if (playingUriRef.current === uri) {
      // Stop current preview
      setPlayingUri(null);
      await stopSoundPreview().catch(() => {});
      return;
    }

    // Start new preview
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayingUri(uri);
    try {
      await previewAlarmSound(uri);
    } catch {
      setPlayingUri(null);
      setError(true);
    }
  }, []);

  // Track whether the list is scrolled to the bottom to hide the fade hint
  const [showBottomFade, setShowBottomFade] = useState(true);

  function handleListScroll(e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowBottomFade(distanceFromBottom > 12);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (Platform.OS !== "android" || !isAvailable) return null;

  if (loading) {
    return (
      <View className="items-center justify-center py-8">
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  return (
    <View
      className="rounded-2xl overflow-hidden bg-card"
      style={{
        maxHeight,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {error && (
        <View className="p-4">
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-danger"
          >
            {t("uxSettings.soundError")}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setReload((n) => n + 1)}
            className="min-h-[48px] justify-center"
          >
            <Text className="font-semibold text-primary">
              {t("uxSettings.retry")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!error && sounds.length === 0 && (
        <Text className="p-4 text-sm text-muted">
          {t("uxSettings.soundEmpty")}
        </Text>
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onScroll={handleListScroll}
        scrollEventThrottle={32}
      >
        {sounds.map((item, index) => {
          const isSelected = item.uri === selectedUri;
          const isPlaying = playingUri === item.uri;
          const displayTitle =
            item.uri === "" ? t("settings.alarmSoundDefault") : item.title;

          return (
            <View key={item.uri || "__default__"}>
              {index > 0 && <View className="h-px bg-border mx-4" />}
              <View
                className="flex-row items-center py-3.5 px-4"
                style={
                  isSelected
                    ? { backgroundColor: theme.primary + "12" }
                    : undefined
                }
              >
                <TouchableOpacity
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled: saving }}
                  accessibilityLabel={displayTitle}
                  disabled={saving}
                  onPress={() => handleSelect(item)}
                  className="flex-1 flex-row items-center min-h-[48px]"
                >
                  {/* Radio indicator */}
                  <Ionicons
                    name={
                      isSelected
                        ? "radio-button-on"
                        : "radio-button-off-outline"
                    }
                    size={22}
                    color={isSelected ? theme.primary : theme.muted}
                  />

                  {/* Title */}
                  <Text
                    className="flex-1 text-sm ml-3 text-text"
                    style={
                      isSelected
                        ? { fontWeight: "600", color: theme.primary }
                        : undefined
                    }
                  >
                    {displayTitle}
                  </Text>
                </TouchableOpacity>

                {/* Preview / stop button */}
                <TouchableOpacity
                  onPress={() => handleTogglePreview(item.uri)}
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    isPlaying
                      ? "uxSettings.stopSound"
                      : "uxSettings.previewSound",
                    { name: displayTitle }
                  )}
                  className="ml-2 w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: isPlaying
                      ? theme.primary + "20"
                      : "transparent",
                  }}
                >
                  <Ionicons
                    name={isPlaying ? "stop-circle" : "play-circle-outline"}
                    size={24}
                    color={isPlaying ? theme.primary : theme.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Subtle bottom hint to indicate scrollability */}
      {showBottomFade && sounds.length > 5 && (
        <View
          className="absolute bottom-0 left-0 right-0 items-center py-1"
          style={{
            backgroundColor: theme.isDark
              ? "rgba(30,30,30,0.85)"
              : "rgba(255,255,255,0.85)",
          }}
          pointerEvents="none"
        >
          <Ionicons name="chevron-down" size={14} color={theme.muted} />
        </View>
      )}
    </View>
  );
}
