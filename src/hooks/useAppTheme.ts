import { useColorScheme } from "react-native";

/**
 * Returns theme-aware raw color values for use inside inline `style={{ }}`
 * props that cannot use NativeWind class-based dark mode.
 *
 * For everything else (Tailwind class names), use the `dark:` prefix or the
 * CSS-variable-backed semantic tokens defined in tailwind.config.js.
 */
export function useAppTheme() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";

  return {
    isDark: dark,

    // ── Semantic surface colors ───────────────────────────────────────────
    card:    dark ? "#0f172a" : "#ffffff",   // bg-card
    cardAlt: dark ? "#1e293b" : "#f8fafc",  // inactive / secondary surface

    // -- Muted text / icon color (matches --color-muted in global.css) --------
    muted: dark ? "#94a3b8" : "#64748b",

    // ── Accent / semantic colors (dark-adaptive for inline styles) ─────────
    primary: dark ? "#60a5fa" : "#4f9cff",   // blue-400 / brand blue
    danger:  dark ? "#f87171" : "#ef4444",   // red-400 / red-500
    warning: dark ? "#fb923c" : "#f97316",   // orange-400 / orange-500
    success: dark ? "#4ade80" : "#22c55e",   // green-400 / green-500
    accent:  dark ? "#a78bfa" : "#8b5cf6",   // violet-400 / violet-500
    amber:   dark ? "#fbbf24" : "#d97706",   // amber-400 / amber-600

    // ── Dose status card backgrounds + borders ────────────────────────────
    doseStatus: {
      pending: {
        bg:     dark ? "#292101" : "#fffbeb",
        border: dark ? "#92400e" : "#fde68a",
      },
      taken: {
        bg:     dark ? "#052e16" : "#f0fdf4",
        border: dark ? "#14532d" : "#86efac",
      },
      skipped: {
        bg:     dark ? "#450a0a" : "#fff1f2",
        border: dark ? "#7f1d1d" : "#fca5a5",
      },
      missed: {
        bg:     dark ? "#0f172a" : "#f8fafc",
        border: dark ? "#334155" : "#cbd5e1",
      },
    },

    // ── Status badge (history rows + calendar detail) ─────────────────────
    statusBadge: {
      taken:   { bg: dark ? "#052e16" : "#dcfce7", color: dark ? "#4ade80" : "#16a34a" },
      skipped: { bg: dark ? "#450a0a" : "#fee2e2", color: dark ? "#f87171" : "#dc2626" },
      pending: { bg: dark ? "#292101" : "#fef3c7", color: dark ? "#fbbf24" : "#d97706" },
      missed:  { bg: dark ? "#1e293b" : "#f1f5f9", color: dark ? "#94a3b8" : "#64748b" },
    },
  } as const;
}
