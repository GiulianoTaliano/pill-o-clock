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
        primary:        "#4f9cff",
        "primary-dark": "#2563eb",
        success:        "#22c55e",
        warning:        "#f59e0b",
        danger:         "#ef4444",
        // ── Semantic tokens — light-mode defaults; dark overrides via dark: prefix ─
        background: "#f0f6ff",
        card:       "#ffffff",
        text:       "#1e293b",
        muted:      "#94a3b8",
        border:     "#e2e8f0",
      },
    },
  },
  plugins: [],
};
