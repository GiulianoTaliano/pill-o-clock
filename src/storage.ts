import Constants, { ExecutionEnvironment } from "expo-constants";

// NitroModules (used by react-native-mmkv v4) are not available in Expo Go.
// Provide an in-memory fallback so the app can still run for development.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function createFallbackStorage() {
  const store = new Map<string, string>();
  return {
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => {
      store.set(key, value);
    },
    remove: (key: string) => store.delete(key),
    contains: (key: string) => store.has(key),
    clearAll: () => {
      store.clear();
    },
    getAllKeys: () => Array.from(store.keys()),
  };
}

function createStorage() {
  if (isExpoGo) {
    return createFallbackStorage();
  }
  const { createMMKV } = require("react-native-mmkv");
  return createMMKV({ id: "pilloclock" });
}

export const storage = createStorage();
