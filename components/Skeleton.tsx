import { useEffect, useRef } from "react";
import { Animated, StyleProp, View, ViewStyle, useColorScheme } from "react-native";

/**
 * Returns an `{ opacity }` animated style object that pulses between 1 and
 * 0.45. Pass it to an `<Animated.View style={anim}>` that wraps all the
 * skeleton boxes in a section so they pulse in perfect sync with a single
 * Animated.Value.
 */
export function useSkeletonAnimation() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return { opacity };
}

/**
 * A single skeleton placeholder box.  Has no animation of its own — it must
 * be placed inside an `<Animated.View style={useSkeletonAnimation()}>` so all
 * sibling boxes pulse together.
 */
export function SkeletonBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const dark = useColorScheme() === "dark";
  return (
    <View
      style={[
        { backgroundColor: dark ? "#1e293b" : "#e2e8f0" },
        style,
      ]}
    />
  );
}
