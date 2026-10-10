import { buildReportHtml, collectReportData } from "../src/services/pdfReport";
import * as db from "../src/db/database";
import { makeDoseLog, makeMedication } from "./factories";
import { initI18n } from "../src/i18n";

jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/services/profileStore", () => ({
  getActiveProfileId: () => "default",
}));
jest.mock("../src/db/database", () => ({
  getDoseLogsByDateRange: jest.fn(),
  getActiveHealthMeasurements: jest.fn(),
  getActiveDailyCheckins: jest.fn(),
  getActiveMedications: jest.fn(),
  getSchedulesByMedication: jest.fn().mockResolvedValue([]),
  getProfiles: jest.fn(),
  getActiveAllergies: jest.fn().mockResolvedValue([]),
}));

beforeAll(() => initI18n());
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(db.getProfiles)
    .mockResolvedValue([
      {
        id: "default",
        name: "Person <A&B>",
        color: "blue",
        createdAt: "2026-01-01",
      },
    ]);
  jest
    .mocked(db.getActiveMedications)
    .mockResolvedValue([
      makeMedication({
        name: "Archived <medicine>",
        isActive: false,
        archivedAt: "2026-10-09",
      }),
    ]);
  jest
    .mocked(db.getDoseLogsByDateRange)
    .mockResolvedValue([
      makeDoseLog({
        scheduledDate: "2026-10-08",
        notes: '<script>alert("x")</script>',
      }),
      makeDoseLog({
        id: "other-person",
        medicationId: "private-med",
        scheduledDate: "2026-10-08",
      }),
    ]);
  jest
    .mocked(db.getActiveHealthMeasurements)
    .mockResolvedValue(
      Array.from({ length: 301 }, (_, i) => ({
        id: `reading-${i}`,
        type: "weight",
        value1: 70,
        measuredAt: "2026-10-08T12:00:00.000Z",
        createdAt: "2026-10-08T12:00:00.000Z",
      }))
    );
  jest.mocked(db.getActiveDailyCheckins).mockResolvedValue([]);
});

it("collects every reading and retains archived history without another person's records", async () => {
  const data = await collectReportData({
    from: "2026-10-01",
    to: "2026-10-09",
  });
  expect(data.measurements).toHaveLength(301);
  expect(db.getActiveHealthMeasurements).toHaveBeenCalledWith(undefined, 0);
  expect(data.logs).toHaveLength(1);
  expect(data.medications[0].name).toBe("Archived <medicine>");
  expect(data.profileId).toBe("default");
});
it("escapes identity, medicine names and notes when generating printable HTML", async () => {
  const html = buildReportHtml(
    await collectReportData({ from: "2026-10-01", to: "2026-10-09" })
  );
  expect(html).toContain("Person &lt;A&amp;B&gt;");
  expect(html).toContain("Archived &lt;medicine&gt;");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});
it("omits unselected report sections", async () => {
  const html = buildReportHtml(
    await collectReportData({ from: "2026-10-01", to: "2026-10-09" }),
    {
      sections: {
        medications: false,
        logs: false,
        measurements: true,
        checkins: false,
      },
    }
  );
  expect(html).not.toContain("Archived &lt;medicine&gt;");
  expect(html).not.toContain("&lt;script&gt;");
  expect(html).toContain("70 kg");
});
it("rejects an invalid range or a missing active person before export", async () => {
  await expect(
    collectReportData({ from: "2026-02-30", to: "2026-03-10" })
  ).rejects.toThrow();
  jest.mocked(db.getProfiles).mockResolvedValue([]);
  await expect(
    collectReportData({ from: "2026-10-01", to: "2026-10-09" })
  ).rejects.toThrow();
});
