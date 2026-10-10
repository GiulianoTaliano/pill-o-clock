import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import OnboardingScreen from "../../app/onboarding";
import { setupNotifications } from "../../src/services/notifications";
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("../../components/Illustration", () => () => null);
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../src/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: jest.requireActual("react-native").View }));
jest.mock("../../src/services/notifications", () => ({ setupNotifications: jest.fn().mockResolvedValue({ granted: true }), openExactAlarmSettings: jest.fn() }));
jest.mock("../../src/services/backgroundTask", () => ({ registerBackgroundFetch: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/services/reminderReadiness", () => ({ getReminderReadiness: jest.fn().mockResolvedValue({ notifications: "notAsked", exact: "granted", fullScreen: "granted" }) }));
beforeEach(() => jest.clearAllMocks());
const mount = async () => { render(<OnboardingScreen />); await act(async () => {}); };
it("skipping onboarding completes without requesting notification permissions", async () => {
  await mount();
  fireEvent.press(screen.getByText("onboarding.skip"));
  expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  // Channels and handlers are prepared for this session, but nothing is asked.
  expect(setupNotifications).toHaveBeenCalledTimes(1);
  expect(setupNotifications).toHaveBeenCalledWith({ requestPermissions: false });
});
it("continuing from the last step does not hide a permission request", async () => {
  await mount();
  fireEvent.press(screen.getAllByLabelText("onboarding.goToSlide")[4]);
  fireEvent.press(screen.getByText("uxSettings.onboardingLater"));
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(setupNotifications).toHaveBeenCalledTimes(1);
  expect(setupNotifications).toHaveBeenCalledWith({ requestPermissions: false });
});
it("only the explicit enable action asks the system for notifications", async () => {
  await mount();
  fireEvent.press(screen.getAllByLabelText("onboarding.goToSlide")[4]);
  await act(async () => { fireEvent.press(screen.getByText("onboarding.enableNotifications")); });
  expect(setupNotifications).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});
