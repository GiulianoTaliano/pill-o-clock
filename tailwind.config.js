/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Theme-aware so `text-primary`/`bg-primary` are AA-readable in both
        // themes (light #2563eb, dark #4f9cff — see global.css); audit OM1.
        primary:        "var(--color-primary)",
        "primary-dark": "#2563eb",
        success:        "#22c55e",
        warning:        "#f59e0b",
        danger:         "#ef4444",
        // ── Semantic tokens — driven by CSS custom properties in global.css ─
        background: "var(--color-background)",
        card:       "var(--color-card)",
        "card-alt": "var(--color-card-alt)",
        text:       "var(--color-text)",
        muted:      "var(--color-muted)",
        border:     "var(--color-border)",
      },
    },
  },
  plugins: [],
};
