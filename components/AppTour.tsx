import { useCallback, useRef, useState, useEffect } from "react";
import { Dimensions, Modal, StyleSheet, TouchableOpacity, View, Text } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import * as Haptics from "expo-haptics";

// ─── Public types ────────────────────────────────────────────────────────────

export type SpotlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TourStep = {
  titleKey: string;
  descKey: string;
  /** Returns the area to highlight, or null for a center fallback. */
  getTargetRect: () => Promise<SpotlightRect | null>;
  /** Where to render the tooltip relative to the spotlight. */
  placement: "above" | "below";
  /** Extra padding added around the spotlight rect. Defaults to 10. */
  padding?: number;
};

type Props = {
  steps: TourStep[];
  visible: boolean;
  onDone: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FADE_MS = 210;
const DEFAULT_PAD = 10;
const TOOLTIP_GAP = 14;      // gap between spotlight edge and tooltip
const TOOLTIP_H_PAD = 20;    // left/right margin of tooltip card
const CORNER_R = 14;

// Use the full screen dimensions so the SVG overlay and absolute positions
// share the same coordinate space as measureInWindow on Android.
const { width: SW, height: SH } = Dimensions.get("screen");

// ─── SVG path helpers ─────────────────────────────────────────────────────────

/** Returns an SVG path that covers the whole screen with a rounded-rect hole.
 *  The evenodd fill rule makes the inner region transparent (the spotlight). */
function buildOverlayPath(x: number, y: number, w: number, h: number, r: number) {
  const outer = `M0,0 H${SW} V${SH} H0 Z`;
  const inner = [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `H${x + r}`,
    `Q${x},${y + h} ${x},${y + h - r}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `Z`,
  ].join(" ");
  return `${outer} ${inner}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppTour({ steps, visible, onDone }: Props) {
  const { t } = useTranslation();

  const opacity = useSharedValue(0);
  const busyRef = useRef(false);

  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<SpotlightRect | null>(null);

  const step = steps[index] ?? null;
  const isLast = index === steps.length - 1;

  // ── Stable wrappers required for safe worklet → JS dispatch ──────────────────
  //
  // Reanimated captures a function's JSI reference in the worklet's __closure at
  // the moment withTiming() is called.  If that reference becomes stale before the
  // animation completes (which happens on every React re-render, e.g. setIndex),
  // the UI-thread worklet calls getHostFunction() on a dead pointer and SIGABRT.
  //
  // Solution: every function passed to runOnJS() inside a worklet MUST be truly
  // stable (empty-deps useCallback).  We achieve this with the ref+wrapper idiom:
  //   • a ref always holds the latest implementation
  //   • a stable wrapper (no deps) reads the ref → safe to capture in worklets

  // onDone — prop, may change if parent re-renders
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const stableOnDone = useCallback(() => { onDoneRef.current(); }, []);

  // busyRef reset after fade-in completes
  const stableBusyFalse = useCallback(() => { busyRef.current = false; }, []);

  // advance to next step: update index + trigger new measurement
  // revealStep reads `steps` from a ref so it stays stable even if `steps` identity
  // changes across parent renders.
  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

  const revealStep = useCallback(
    (idx: number) => {
      const s = stepsRef.current[idx];
      if (!s) return;
      s.getTargetRect().then((rect) => {
        setSpot(rect);
        opacity.value = withTiming(1, { duration: FADE_MS }, () => {
          "worklet";
          runOnJS(stableBusyFalse)();
        });
      });
    },
    // opacity and stableBusyFalse are stable; stepsRef is a ref object (stable).
    [opacity, stableBusyFalse]
  );

  // Combined "jump to step" called on the JS thread after a fade-out.
  // Using a ref so stableGotoStep itself has empty deps (truly stable).
  const revealStepRef = useRef(revealStep);
  useEffect(() => { revealStepRef.current = revealStep; }, [revealStep]);

  const stableGotoStep = useCallback((idx: number) => {
    setIndex(idx);
    revealStepRef.current(idx);
  }, []); // empty deps — stable forever

  // ── Initial reveal when tour becomes visible ──────────────────────────────────

  useEffect(() => {
    if (visible) {
      busyRef.current = false;
      setIndex(0);
      setSpot(null);
      opacity.value = 0;
      revealStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const advance = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isLast) {
      opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        "worklet";
        // stableOnDone has empty deps → reference is always valid inside worklet
        if (finished) runOnJS(stableOnDone)();
      });
      return;
    }

    const next = index + 1;
    // stableGotoStep has empty deps → always safe to capture in worklet
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      "worklet";
      if (finished) runOnJS(stableGotoStep)(next);
    });
  }, [index, isLast, opacity, stableOnDone, stableGotoStep]);

  const skip = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
      "worklet";
      if (finished) runOnJS(stableOnDone)();
    });
  }, [opacity, stableOnDone]);

  // ── Animated style ──────────────────────────────────────────────────────────

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // ── Geometry ────────────────────────────────────────────────────────────────

  if (!visible || !step) return null;

  const pad = step.padding ?? DEFAULT_PAD;
  const sx = spot ? spot.x - pad : SW / 2 - 50;
  const sy = spot ? spot.y - pad : SH / 2 - 25;
  const sw = spot ? spot.width + pad * 2 : 100;
  const sh = spot ? spot.height + pad * 2 : 50;

  const pathD = buildOverlayPath(sx, sy, sw, sh, CORNER_R);

  // Place the tooltip above or below the spotlight
  const tooltipPlacement =
    step.placement === "below"
      ? { top: sy + sh + TOOLTIP_GAP }
      : { bottom: SH - sy + TOOLTIP_GAP };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={skip}
    >
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
        {/* ── Dimmed overlay with spotlight cutout ── */}
        <Svg
          width={SW}
          height={SH}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path d={pathD} fill="rgba(0,0,0,0.78)" fillRule="evenodd" />
        </Svg>

        {/* ── Highlight ring around spotlight ── */}
        <View
          pointerEvents="none"
          style={[
            styles.spotRing,
            {
              left: sx - 2,
              top: sy - 2,
              width: sw + 4,
              height: sh + 4,
              borderRadius: CORNER_R + 2,
            },
          ]}
        />

        {/* ── Tooltip card ── */}
        <View
          style={[
            styles.tooltip,
            { left: TOOLTIP_H_PAD, right: TOOLTIP_H_PAD },
            tooltipPlacement,
          ]}
        >
          {/* Progress row */}
          <View style={styles.progressRow}>
            <View style={styles.dotsContainer}>
              {steps.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      width: i === index ? 18 : 6,
                      backgroundColor: i === index ? "#4f9cff" : "#e2e8f0",
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.counter}>
              {index + 1}/{steps.length}
            </Text>
          </View>

          {/* Text */}
          <Text style={styles.title}>{t(step.titleKey)}</Text>
          <Text style={styles.desc}>{t(step.descKey)}</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={skip}
              style={styles.btnSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.btnSkipText}>{t("tour.skip")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={advance}
              style={styles.btnNext}
              activeOpacity={0.85}
            >
              <View style={styles.btnNextInner}>
                <Text style={styles.btnNextText}>
                  {isLast ? t("tour.done") : t("tour.next")}
                </Text>
                {!isLast && (
                  <Ionicons name="chevron-forward" size={15} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  spotRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(79,156,255,0.55)",
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  counter: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 6,
  },
  desc: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 22,
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btnSkip: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSkipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8",
  },
  btnNext: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#4f9cff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnNextInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  btnNextText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});
