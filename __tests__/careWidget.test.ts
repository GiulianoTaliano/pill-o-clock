import { buildCareWidgetData } from "../src/services/careWidget";
import { makeTodayDose } from "./factories";
jest.mock("expo-widget", () => ({ updateWidget: jest.fn() }));
jest.mock("../src/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock("../src/services/doseTime", () => ({ formatSnoozedTime: (value: string) => "postponed " + value }));

it("keeps an empty plan distinct from all doses taken", () => {
  const data = buildCareWidgetData([], "Ana");
  expect(data.title).toBe("ux.widgetEmpty");
  expect(data.allDone).toBe(false);
});
it("does not call skipped doses taken", () => {
  const data = buildCareWidgetData([makeTodayDose({ status: "skipped" })], "Ana");
  expect(data.title).toBe("ux.widgetRecorded");
  expect(data.allDone).toBe(false);
});
it("shows an unregistered dose instead of an all-done message", () => {
  const data = buildCareWidgetData([makeTodayDose({ status: "missed" })], "Ana");
  expect(data.name).toBe("Ibuprofen");
  expect(data.subtitle).toContain("ux.unregistered");
  expect(data.allDone).toBe(false);
});
it("uses the effective postponed time and identifies the person", () => {
  const data = buildCareWidgetData([makeTodayDose({ snoozedUntil: "2026-10-10T00:20:00.000Z" })], "Ana");
  expect(data.time).toBe("postponed 2026-10-10T00:20:00.000Z");
  expect(data.subtitle).toContain(data.time);
  expect(data.profile).toBe("Ana");
});
