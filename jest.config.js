module.exports = {
  preset: "jest-expo",
  // Only treat *.test.* and *.spec.* files as test suites (excludes helpers like factories.ts)
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop|date-fns|@noble/.*)",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Claude Code worktrees under .claude/ contain a full copy of the repo;
  // without these ignores jest-haste-map sees duplicate modules (expo-alarm)
  // and the worktree's __tests__ get picked up twice.
  modulePathIgnorePatterns: ["<rootDir>/.claude/"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/"],
  collectCoverageFrom: [
    "src/store/slices/medications.ts",
    "src/services/backgroundTask.ts",
    "src/hooks/useTodaySchedule.ts",
    "src/utils/index.ts",
  ],
  coverageThreshold: {
    "./src/store/slices/medications.ts": { lines: 70 },
    "./src/services/backgroundTask.ts": { lines: 70 },
    "./src/hooks/useTodaySchedule.ts": { lines: 70 },
    "./src/utils/index.ts": { lines: 70 },
  },
  coverageReporters: ["text", "lcov", "json-summary"],
  // Force Jest to exit after all tests complete even if open handles remain.
  // Common with React Native's internal scheduler and fake timers.
  forceExit: true,
};
