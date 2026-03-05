# 💊 Pill-O-Clock

> Never miss a dose again. Smart medication reminders with adherence tracking.

Pill-O-Clock is a personal medication assistant built with React Native and Expo. It reminds you exactly when to take each medication, rings a persistent alarm with quick-action buttons, and logs your adherence — all stored locally on your device with no data ever sent to external servers.

---

## Features

- **Persistent alarms** — Alarm sound repeats every 5 minutes until you respond.
- **Quick actions** — Take, snooze (15 min), or skip a dose directly from the notification, without opening the app.
- **Complete medication management** — Name, dose (mg, ml, drops, tablets, capsules…), category, instructions, color, and treatment period (start/end dates).
- **Flexible schedules** — Daily alarms or only on specific days of the week. Multiple alarms per medication.
- **Adherence tracking** — History tab showing taken, skipped, and missed doses over the last 30 days with an adherence rate.
- **Visual calendar** — Monthly view grouped by status: pending, taken, skipped, and missed.
- **Backup & restore** — Export and import a full backup (medications + history) at any time.
- **Dark mode** — Follows the system theme automatically.
- **Bilingual** — English and Spanish, auto-detected from device locale with manual override in Settings.
- **100% local** — All data lives in a private SQLite database on your device. No accounts, no analytics, no ads.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [React Native](https://reactnative.dev/) + [Expo](https://expo.dev/) (~54) |
| Navigation | [Expo Router](https://expo.github.io/router/) v6 (file-based) |
| Styling | [NativeWind](https://www.nativewind.dev/) v4 (Tailwind CSS) |
| State | [Zustand](https://github.com/pmndrs/zustand) v5 |
| Database | [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) v16 |
| Notifications | [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) |
| Background tasks | expo-background-fetch + expo-task-manager |
| Internationalization | i18next + react-i18next |
| Animations | react-native-reanimated v4 |

---

## Project Structure

```
pill-o-clock/
├── app/                        # Expo Router pages
│   ├── _layout.tsx             # Root layout (providers, splash)
│   ├── alarm.tsx               # Fullscreen alarm screen
│   ├── onboarding.tsx          # First-launch onboarding
│   ├── (tabs)/                 # Bottom tab navigator
│   │   ├── index.tsx           # Today's schedule
│   │   ├── calendar.tsx        # Monthly calendar
│   │   ├── history.tsx         # Adherence history
│   │   ├── medications.tsx     # Medication list
│   │   └── settings.tsx        # App settings
│   └── medication/
│       ├── new.tsx             # Add medication
│       └── [id].tsx            # Edit medication
├── components/                 # Reusable UI components
├── src/
│   ├── db/                     # SQLite database & migrations
│   ├── store/                  # Zustand store
│   ├── services/               # Notifications, backup, background tasks
│   ├── hooks/                  # Custom hooks
│   ├── i18n/                   # English & Spanish translations
│   ├── types/                  # TypeScript interfaces
│   └── utils/                  # Shared helpers
├── assets/                     # Icons, images, fonts
└── docs/                       # Privacy policy
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Android Studio](https://developer.android.com/studio) (for Android emulator) or [Xcode](https://developer.apple.com/xcode/) (for iOS simulator, macOS only)

### Installation

```bash
# Clone the repository
git clone https://github.com/giulianotaliano/pill-o-clock.git
cd pill-o-clock

# Install dependencies
npm install

# Start the development server
npm start
```

Then press `a` to open on an Android emulator, `i` for iOS simulator, or scan the QR code with [Expo Go](https://expo.dev/go).

### Running on a physical device

Notifications and exact alarms require a real device. Expo Go supports local notifications; for full alarm behavior (sound, background tasks) use a [development build](https://docs.expo.dev/develop/development-builds/introduction/):

```bash
# Android development build
npx expo run:android

# iOS development build (macOS only)
npx expo run:ios
```

---

## Building for Production

This project uses [EAS Build](https://docs.expo.dev/build/introduction/). The `eas.json` defines three profiles: `development` (APK, internal), `preview` (APK, internal), and `production` (AAB/IPA).

```bash
# Build Android APK for internal testing
npx eas-cli build --platform android --profile preview

# Build Android AAB for Play Store
npx eas-cli build --platform android --profile production

# Build iOS IPA for App Store (macOS only)
npx eas-cli build --platform ios --profile production

# Submit to stores
npx eas-cli submit --platform android --profile production
npx eas-cli submit --platform ios --profile production
```

---

## Deep Link Scheme

The app registers the `pilloclock://` scheme. The alarm screen is reachable via:

```
pilloclock://alarm?scheduleId=<id>&date=<YYYY-MM-DD>
```

This link is used internally by notification actions to open the fullscreen alarm.

---

## Privacy

All data is stored exclusively in a private SQLite database on the user's device. The app:

- Does **not** collect any personal data
- Does **not** connect to any external server
- Does **not** include analytics, crash reporters, or ad SDKs

Full privacy policy: [giulianotaliano.github.io/pill-o-clock/privacy-policy.html](https://giulianotaliano.github.io/pill-o-clock/privacy-policy.html)

---

## License

This project is currently not under an open-source license. All rights reserved © Giuliano Italiano.
