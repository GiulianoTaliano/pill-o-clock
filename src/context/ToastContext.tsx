import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Text,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppPressable } from "../../components/AppPressable";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTranslation } from "../i18n";

export type ToastType = "success" | "error" | "info";
interface ToastEntry {
  id: number;
  message: string;
  type: ToastType;
}
const ToastContext = createContext<{
  showToast: (message: string, type?: ToastType) => void;
}>({ showToast: () => {} });
export function useToast() {
  return useContext(ToastContext);
}

const TYPE_CONFIG = {
  success: { bg: "#14663d", icon: "checkmark-circle" },
  error: { bg: "#a62236", icon: "alert-circle" },
  info: { bg: "#2459c4", icon: "information-circle" },
} as const;

function ToastItem({
  entry,
  onDone,
}: {
  entry: ToastEntry;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { t } = useTranslation();
  const opacity = useRef(new Animated.Value(0)).current;
  const cfg = TYPE_CONFIG[entry.type];
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    AccessibilityInfo.announceForAccessibility(entry.message);
    Animated.timing(opacity, {
      toValue: 1,
      duration: reduced ? 0 : 180,
      useNativeDriver: true,
    }).start();
    // Errors stay until dismissed; screen readers and custom timeout settings get more time.
    if (entry.type !== "error") {
      const getTimeout =
        AccessibilityInfo.getRecommendedTimeoutMillis?.(5000) ??
        Promise.resolve(5000);
      Promise.resolve(getTimeout)
        .then((ms) => {
          if (cancelled) return;
          timer = setTimeout(() => onDoneRef.current(), Math.max(ms, 5000));
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(() => onDoneRef.current(), 5000);
        });
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      opacity.stopAnimation();
    };
  }, [entry.id, entry.message, entry.type, opacity, reduced]);
  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: cfg.bg, opacity, top: insets.top + 10 },
      ]}
    >
      <Ionicons name={cfg.icon} size={22} color="#fff" />
      <Text style={styles.message} accessibilityLiveRegion="polite">
        {entry.message}
      </Text>
      <AppPressable
        accessibilityLabel={t("ux.dismiss")}
        onPress={onDone}
        style={styles.close}
      >
        <Ionicons name="close" size={22} color="#fff" />
      </AppPressable>
    </Animated.View>
  );
}
let nextId = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastEntry[]>([]);
  const showToast = useCallback((message: string, type: ToastType = "info") => {
    if (type === "success")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
    if (type === "error")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {}
      );
    setQueue((prev) => {
      if (
        prev.some((entry) => entry.message === message && entry.type === type)
      )
        return prev;
      const entry = { id: ++nextId, message, type };
      // A current error remains readable. Queued messages appear one at a time.
      return [...prev.slice(0, 4), entry];
    });
  }, []);
  const dismiss = useCallback(() => setQueue((prev) => prev.slice(1)), []);
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {queue[0] && (
          <ToastItem key={queue[0].id} entry={queue[0]} onDone={dismiss} />
        )}
      </View>
    </ToastContext.Provider>
  );
}
const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 10,
    borderRadius: 16,
    elevation: 12,
    zIndex: 9999,
  },
  message: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 23,
    flex: 1,
    fontWeight: "500",
  },
  close: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
