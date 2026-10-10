import { act, renderHook } from "@testing-library/react-native";
import i18n, { initI18n, useTranslation } from "../../src/i18n";
import { useCareWidget } from "../../src/hooks/useCareWidget";

jest.mock("../../src/hooks/useTodaySchedule", () => ({ useTodaySchedule: () => [] }));
jest.mock("../../src/store", () => ({ useAppStore: (selector: (state: unknown) => unknown) => selector({ profiles: [], activeProfileId: "default" }) }));
jest.mock("../../src/services/careWidget", () => ({ updateCareWidget: jest.fn().mockResolvedValue(undefined) }));

it("renders the startup translation hook before initialization so startup can continue", async () => {
  expect(i18n.isInitialized).toBeFalsy();
  const { result } = renderHook(() => {
    const translation = useTranslation();
    useCareWidget(false);
    return translation;
  });
  expect(result.current).not.toBeNull();
  expect(result.current.ready).toBeFalsy();
  await act(async () => { await initI18n(); });
  expect(result.current.ready).toBe(true);
  expect(result.current.t("common.back")).not.toBe("common.back");
});
