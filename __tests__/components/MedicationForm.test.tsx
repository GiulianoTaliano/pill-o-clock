import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { MedicationForm } from "../../components/MedicationForm";

const mockDispatch = jest.fn();
let mockPrevent: (event: { data: { action: { type: string } } }) => void;
jest.mock("expo-router", () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
}));
jest.mock("@react-navigation/native", () => ({
  usePreventRemove: (_enabled: boolean, callback: typeof mockPrevent) => {
    mockPrevent = callback;
  },
}));
jest.mock("../../src/context/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock("../../src/store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ profiles: [], activeProfileId: "default", seniorMode: false }),
}));
jest.mock("../../src/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  getDateLocale: () => require("date-fns/locale").enUS,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@react-native-community/datetimepicker", () => () => null);
jest.mock("../../components/ColorPicker", () => ({ ColorPicker: () => null }));
jest.mock("../../components/BarcodeScannerModal", () => ({
  BarcodeScannerModal: () => null,
}));
jest.mock("../../components/DayToggle", () => ({ DayToggle: () => null }));
jest.mock("../../src/services/barcode", () => ({
  isBarcodeScanSupported: () => false,
}));
jest.mock("../../src/services/drugDb", () => ({
  getActiveDrugCatalog: () => ({ attributionKey: "catalog" }),
  searchDrugs: () => [],
}));

function mount(onSubmit: () => Promise<boolean | void>, onSaved = jest.fn()) {
  render(
    <MedicationForm
      initialValues={{
        name: "Test treatment",
        dosageAmount: 1,
        dosageUnit: "mg",
        category: "otro",
        color: "blue",
        notes: "",
        isPRN: true,
        schedules: [],
      }}
      submitLabel="Save treatment"
      isSubmitting={false}
      onSubmit={onSubmit}
      onSaved={onSaved}
    />
  );
  return onSaved;
}
beforeEach(() => jest.clearAllMocks());

it("leaves a saved treatment without asking to discard changes", async () => {
  const alert = jest.spyOn(Alert, "alert");
  const action = { type: "GO_BACK" };
  const onSaved = jest.fn(() => mockPrevent({ data: { action } }));
  mount(jest.fn().mockResolvedValue(true), onSaved);
  await act(async () => {
    fireEvent.press(screen.getByText("Save treatment"));
  });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith(action);
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});

it("keeps the form open when save review is cancelled", async () => {
  const onSaved = mount(jest.fn().mockResolvedValue(undefined));
  await act(async () => {
    fireEvent.press(screen.getByText("Save treatment"));
  });
  expect(onSaved).not.toHaveBeenCalled();
});
