import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";
import * as Haptics from "expo-haptics";
import { Medication } from "../src/types";
import { getColorConfig } from "../src/utils";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { RGBPickerModal } from "./RGBPickerModal";

const RECENT_COLORS_KEY = STORAGE_KEYS.RECENT_COLORS;
const MAX_RECENT = 5;

interface ColorPickerProps {
  value: Medication["color"];
  onChange: (color: Medication["color"]) => void;
}

const PRESET_ORDER: string[] = [
  "blue", "green", "purple", "orange", "red", "teal", "pink",
];

function loadRecentColors(): string[] {
  try {
    const raw = storage.getString(RECENT_COLORS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentColor(hex: string): string[] {
  const current = loadRecentColors();
  const updated = [hex, ...current.filter((c) => c !== hex)].slice(0, MAX_RECENT);
  storage.set(RECENT_COLORS_KEY, JSON.stringify(updated));
  return updated;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  // Use the currently selected custom color as the modal's starting point
  const isCustomSelected = value.startsWith("#");
  const modalInitial = isCustomSelected ? value : "#3b82f6";

  useEffect(() => {
    setRecentColors(loadRecentColors());
  }, []);

  const handleConfirm = useCallback((hex: string) => {
    setModalVisible(false);
    Haptics.selectionAsync();
    const updated = saveRecentColor(hex);
    setRecentColors(updated);
    onChange(hex);
  }, [onChange]);

  const selectPreset = (color: string) => {
    Haptics.selectionAsync();
    onChange(color);
  };

  const selectedBorderColor = theme.isDark ? "#f1f5f9" : "#1e293b";

  return (
    <>
      <View className="flex-row gap-2 flex-wrap">
        {/* Preset colors */}
        {PRESET_ORDER.map((color) => {
          const c = getColorConfig(color);
          const selected = value === color;
          return (
            <TouchableOpacity
              key={color}
              onPress={() => selectPreset(color)}
              style={{
                backgroundColor: c.bg,
                borderColor: selected ? selectedBorderColor : "transparent",
              }}
              className="w-9 h-9 rounded-full border-2 items-center justify-center"
            >
              {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
            </TouchableOpacity>
          );
        })}

        {/* Recent custom colors */}
        {recentColors.map((hex) => {
          const selected = value === hex;
          return (
            <TouchableOpacity
              key={hex}
              onPress={() => selectPreset(hex)}
              style={{
                backgroundColor: hex,
                borderColor: selected ? selectedBorderColor : "transparent",
              }}
              className="w-9 h-9 rounded-full border-2 items-center justify-center"
            >
              {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
            </TouchableOpacity>
          );
        })}

        {/* "+" to open RGB picker */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setModalVisible(true);
          }}
          style={{
            borderColor: theme.isDark ? "#475569" : "#cbd5e1",
            backgroundColor: theme.isDark ? "#1e293b" : "#f1f5f9",
          }}
          className="w-9 h-9 rounded-full border-2 items-center justify-center"
        >
          <Ionicons
            name="add"
            size={18}
            color={theme.muted}
          />
        </TouchableOpacity>
      </View>

      {/* Label for recent row */}
      {recentColors.length > 0 && (
        <Text className="text-muted text-xs mt-1.5">
          {t("colorPicker.recentLabel")}
        </Text>
      )}

      <RGBPickerModal
        visible={modalVisible}
        initialColor={modalInitial}
        onClose={() => setModalVisible(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
