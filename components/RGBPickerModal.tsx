import { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface RGBPickerModalProps {
  visible: boolean;
  initialColor?: string; // hex e.g. "#a855f7"
  onClose: () => void;
  onConfirm: (hex: string) => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toH = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

export function RGBPickerModal({
  visible,
  initialColor = "#3b82f6",
  onClose,
  onConfirm,
}: RGBPickerModalProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  const initial = hexToRgb(initialColor);
  const [r, setR] = useState(initial.r);
  const [g, setG] = useState(initial.g);
  const [b, setB] = useState(initial.b);

  const hex = rgbToHex(r, g, b);

  // Reset when modal opens with a new initialColor
  const handleVisible = () => {
    const c = hexToRgb(initialColor);
    setR(c.r);
    setG(c.g);
    setB(c.b);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={handleVisible}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <TouchableWithoutFeedback>
            <View
              style={{ backgroundColor: theme.card }}
              className="w-full rounded-3xl p-6 shadow-xl"
            >
              {/* Title */}
              <Text className="text-text text-lg font-bold mb-5 text-center">
                {t("colorPicker.title")}
              </Text>

              {/* Preview */}
              <View className="items-center mb-6">
                <View
                  style={{ backgroundColor: hex }}
                  className="w-20 h-20 rounded-full shadow-md"
                />
                <Text className="text-muted text-sm font-mono mt-2 uppercase tracking-widest">
                  {hex}
                </Text>
              </View>

              {/* Sliders */}
              <SliderRow
                label="R"
                value={r}
                onValueChange={setR}
                color="#ef4444"
                theme={theme}
              />
              <SliderRow
                label="G"
                value={g}
                onValueChange={setG}
                color="#22c55e"
                theme={theme}
              />
              <SliderRow
                label="B"
                value={b}
                onValueChange={setB}
                color="#3b82f6"
                theme={theme}
              />

              {/* Buttons */}
              <View className="flex-row gap-3 mt-6">
                <TouchableOpacity
                  onPress={onClose}
                  style={{ borderColor: theme.isDark ? "#334155" : "#e2e8f0" }}
                  className="flex-1 py-3 rounded-2xl border items-center"
                >
                  <Text className="text-muted font-semibold text-sm">
                    {t("common.cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onConfirm(hex)}
                  style={{ backgroundColor: hex }}
                  className="flex-1 py-3 rounded-2xl items-center"
                >
                  <Text className="text-white font-bold text-sm">
                    {t("common.confirm")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Slider row ──────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  color: string;
  theme: ReturnType<typeof useAppTheme>;
}

function SliderRow({ label, value, onValueChange, color, theme }: SliderRowProps) {
  return (
    <View className="flex-row items-center gap-3 mb-2">
      <Text style={{ color }} className="w-5 text-sm font-bold text-center">
        {label}
      </Text>
      <Slider
        style={{ flex: 1, height: 40 }}
        minimumValue={0}
        maximumValue={255}
        step={1}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={color}
        maximumTrackTintColor={theme.isDark ? "#334155" : "#e2e8f0"}
        thumbTintColor={Platform.OS === "android" ? color : undefined}
      />
      <Text className="text-muted text-xs font-mono w-8 text-right">
        {Math.round(value)}
      </Text>
    </View>
  );
}
