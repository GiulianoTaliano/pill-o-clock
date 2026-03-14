import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import React from "react";

const RIPPLE_COLOR = "rgba(79, 156, 255, 0.13)";

export interface AppPressableProps extends PressableProps {
  /** Optional opacity applied on press for iOS (default 0.7). */
  pressedOpacity?: number;
}

/**
 * Drop-in replacement for TouchableOpacity that uses Material 3 ripple on
 * Android and opacity feedback on iOS.
 */
export function AppPressable({
  pressedOpacity = 0.7,
  style,
  android_ripple,
  ...rest
}: AppPressableProps) {
  return (
    <Pressable
      android_ripple={android_ripple ?? { color: RIPPLE_COLOR }}
      style={(state) => {
        const base = typeof style === "function" ? style(state) : style;
        return [base as StyleProp<ViewStyle>, state.pressed && { opacity: pressedOpacity }];
      }}
      {...rest}
    />
  );
}
