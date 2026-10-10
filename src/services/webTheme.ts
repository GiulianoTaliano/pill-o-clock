import { Platform } from "react-native";
import { colorScheme } from "nativewind";
import type { ThemeMode } from "../store/types";

let removeSystemListener: (() => void) | undefined;
/** Web must update the CSS class and NativeWind observable together. */
export function applyWebTheme(mode: ThemeMode) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  removeSystemListener?.();
  removeSystemListener = undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () =>
    colorScheme.set(
      mode === "system" ? (media.matches ? "dark" : "light") : mode
    );
  apply();
  if (mode === "system") {
    media.addEventListener("change", apply);
    removeSystemListener = () => media.removeEventListener("change", apply);
  }
}
