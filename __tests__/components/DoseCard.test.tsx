import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { DoseCard } from "../../components/DoseCard";
import { makeTodayDose } from "../factories";

const mockToast = jest.fn();
jest.mock("../../src/context/ToastContext", () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock("../../src/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => selector({ seniorMode: false }) }));
jest.mock("../../src/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../src/services/doseTime", () => ({ formatSnoozedTime: (value: string) => value }));

function mount(onSkip = jest.fn(), onTake = jest.fn()) {
  render(<DoseCard dose={makeTodayDose()} onTake={onTake} onSkip={onSkip} onSnooze={jest.fn()} />);
}
beforeEach(() => jest.clearAllMocks());

it("cancelling a skip records nothing, including after choosing a reason", () => {
  const skip = jest.fn();
  mount(skip);
  fireEvent.press(screen.getByText("doseCard.skip"));
  fireEvent.press(screen.getByText("doseCard.skipReason_side_effect"));
  fireEvent.press(screen.getByText("common.cancel"));
  expect(skip).not.toHaveBeenCalled();
  expect(screen.queryByText("doseCard.skipReasonTitle")).toBeNull();
});

it("skipping without a reason requires the explicit confirmation action", async () => {
  const skip = jest.fn().mockResolvedValue(undefined);
  mount(skip);
  fireEvent.press(screen.getByText("doseCard.skip"));
  expect(skip).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getAllByText("doseCard.skip").slice(-1)[0]); });
  expect(skip).toHaveBeenCalledTimes(1);
  expect(skip).toHaveBeenCalledWith(undefined);
});

it("prevents a second take while the first save is pending", async () => {
  let finish!: () => void;
  const take = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  mount(jest.fn(), take);
  fireEvent.press(screen.getByText("ux.recordTake"));
  fireEvent.press(screen.getByText("ux.recordTake"));
  expect(take).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
});

it("retains the skip choices after a failed save so it can be retried", async () => {
  const skip = jest.fn().mockRejectedValue(new Error("disk full"));
  mount(skip);
  fireEvent.press(screen.getByText("doseCard.skip"));
  fireEvent.press(screen.getByText("doseCard.skipReason_no_stock"));
  await act(async () => { fireEvent.press(screen.getAllByText("doseCard.skip").slice(-1)[0]); });
  expect(skip).toHaveBeenCalledWith("no_stock");
  expect(mockToast).toHaveBeenCalledWith("ux.saveFailed", "error");
  expect(screen.getByText("doseCard.skipReasonTitle")).toBeTruthy();
});
