import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { Animated, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info";

interface ToastEntry {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

// ─── Context ───────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// ─── Config ────────────────────────────────────────────────────────────────

const TOAST_DURATION_MS = 3000;
const ANIM_DURATION_MS = 250;

const TYPE_CONFIG: Record<ToastType, { bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  success: { bg: "#16a34a", icon: "checkmark-circle" },
  error:   { bg: "#dc2626", icon: "alert-circle" },
  info:    { bg: "#4f9cff", icon: "information-circle" },
};

// ─── Single toast item ─────────────────────────────────────────────────────

function ToastItem({ entry, onDone }: { entry: ToastEntry; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const cfg = TYPE_CONFIG[entry.type];

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: ANIM_DURATION_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: ANIM_DURATION_MS, useNativeDriver: true }),
    ]).start();

    const hideTimer = setTimeout(() => {
      // Slide out
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: ANIM_DURATION_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: ANIM_DURATION_MS, useNativeDriver: true }),
      ]).start(onDone);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(hideTimer);
  // opacity and translateY are stable Animated.Value refs; onDone is intentionally
  // not reactive — the animation should only start once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: cfg.bg, opacity, transform: [{ translateY }], marginBottom: insets.bottom + 16 },
      ]}
    >
      <Ionicons name={cfg.icon} size={20} color="#fff" style={{ marginRight: 8 }} />
      <Text style={styles.toastText} numberOfLines={3}>{entry.message}</Text>
    </Animated.View>
  );
}

// ─── Provider ──────────────────────────────────────────────────────────────

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    // Haptic feedback per type
    if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-1), { id, message, type }]); // max 2 visible
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDone={() => removeToast(entry.id)} />
      ))}
    </ToastContext.Provider>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 0,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 9999,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    lineHeight: 20,
  },
});
