/**
 * jest.setup.ts
 * Runs after the test framework is installed for every test suite.
 * Registers global mocks for native modules that have no pure-JS fallback.
 */

// ─── Sentry ────────────────────────────────────────────────────────────────
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
  withScope: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: jest.fn((fn: () => void) => fn),
}));

// ─── expo-haptics ──────────────────────────────────────────────────────────
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

// ─── expo-task-manager ─────────────────────────────────────────────────────
jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
  unregisterAllTasksAsync: jest.fn().mockResolvedValue(undefined),
  getRegisteredTasksAsync: jest.fn().mockResolvedValue([]),
}));

// ─── expo-background-fetch ─────────────────────────────────────────────────
jest.mock("expo-background-fetch", () => ({
  getStatusAsync: jest.fn().mockResolvedValue(3),
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
  BackgroundFetchResult: { NewData: "newData", Failed: "failed", NoData: "noData" },
  BackgroundFetchStatus: { Restricted: 1, Denied: 2, Available: 3 },
}));

// ─── expo-secure-store (in-memory) ─────────────────────────────────────────
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
    // Sync variants (used by the SQLCipher key bootstrap in database.ts).
    setItem: jest.fn((k: string, v: string) => { store.set(k, v); }),
    getItem: jest.fn((k: string) => store.get(k) ?? null),
  };
});

// ─── expo-crypto (deterministic) ───────────────────────────────────────────
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  // Deterministic fake digest — good enough for hash-compare unit tests.
  digestStringAsync: jest.fn(async (_alg: string, input: string) => `sha256(${input})`),
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n).fill(7)),
}));

// ─── expo-local-authentication ─────────────────────────────────────────────
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(false),
  isEnrolledAsync: jest.fn().mockResolvedValue(false),
  authenticateAsync: jest.fn().mockResolvedValue({ success: false }),
}));

// ─── expo-store-review ─────────────────────────────────────────────────────
jest.mock("expo-store-review", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  requestReview: jest.fn().mockResolvedValue(undefined),
}));

// ─── expo-notifications ────────────────────────────────────────────────────
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-id"),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationHandler: jest.fn(),
  AndroidNotificationPriority: { HIGH: "high", MAX: "max", DEFAULT: "default" },
}));

// ─── expo-alarm (local native module) ─────────────────────────────────────
jest.mock("expo-alarm", () => ({
  isAvailable: true,
  scheduleAlarm: jest.fn().mockResolvedValue(undefined),
  cancelAlarm: jest.fn().mockResolvedValue(undefined),
  stopAlarm: jest.fn().mockResolvedValue(undefined),
  checkFullScreenIntentPermission: jest.fn().mockResolvedValue(true),
  requestFullScreenIntentPermission: jest.fn().mockResolvedValue(undefined),
  setAlarmWindowFlags: jest.fn().mockResolvedValue(undefined),
  clearAlarmWindowFlags: jest.fn().mockResolvedValue(undefined),
  getAvailableAlarmSounds: jest.fn().mockResolvedValue([]),
  previewAlarmSound: jest.fn().mockResolvedValue(undefined),
  stopSoundPreview: jest.fn().mockResolvedValue(undefined),
  setAlarmSound: jest.fn().mockResolvedValue(undefined),
  getAlarmSound: jest.fn().mockResolvedValue({ uri: "", title: "Default" }),
}));

// ─── expo-device ──────────────────────────────────────────────────────────
jest.mock("expo-device", () => ({
  osName: "Android",
  osVersion: "14",
  isDevice: true,
}));

// ─── react-native-mmkv (also backed by __mocks__/react-native-mmkv.js) ────
jest.mock("react-native-mmkv");
