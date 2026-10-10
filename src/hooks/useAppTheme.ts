import { useColorScheme } from "nativewind";

/** Raw semantic colors for native styles, matching global.css. */
export function useAppTheme() {
  const dark = useColorScheme().colorScheme === "dark";
  return {
    isDark: dark,
    background: dark ? "#0b1324" : "#f4f7fc",
    card: dark ? "#132036" : "#ffffff",
    cardAlt: dark ? "#1d2c44" : "#edf2f9",
    text: dark ? "#f1f5fb" : "#17263c",
    border: dark ? "#344760" : "#d9e2ef",
    muted: dark ? "#b9c8dc" : "#52647c",
    primary: dark ? "#91b7ff" : "#2459c4",
    actionFill: "#2459c4",
    onAction: "#ffffff",
    danger: dark ? "#ff9b9b" : "#b42336",
    warning: dark ? "#ffc980" : "#945000",
    success: dark ? "#8ee0af" : "#167544",
    accent: dark ? "#c0b2ff" : "#6e48bf",
    amber: dark ? "#ffd27d" : "#875200",
    doseStatus: {
      pending: {
        bg: dark ? "#132036" : "#ffffff",
        border: dark ? "#344760" : "#d9e2ef",
      },
      taken: {
        bg: dark ? "#132036" : "#ffffff",
        border: dark ? "#344760" : "#d9e2ef",
      },
      skipped: {
        bg: dark ? "#132036" : "#ffffff",
        border: dark ? "#344760" : "#d9e2ef",
      },
      missed: {
        bg: dark ? "#132036" : "#ffffff",
        border: dark ? "#344760" : "#d9e2ef",
      },
    },
    secondaryText: dark ? "#d0dced" : "#42546d",
    statusBadge: {
      taken: {
        bg: dark ? "#153c2d" : "#e0f2e8",
        color: dark ? "#8ee0af" : "#12613a",
      },
      skipped: {
        bg: dark ? "#492534" : "#fbe7ec",
        color: dark ? "#ffb2c2" : "#9d233d",
      },
      pending: {
        bg: dark ? "#43371f" : "#fff0d6",
        color: dark ? "#ffd27d" : "#805000",
      },
      missed: {
        bg: dark ? "#26364e" : "#e8edf5",
        color: dark ? "#d0dced" : "#42546d",
      },
    },
  } as const;
}
