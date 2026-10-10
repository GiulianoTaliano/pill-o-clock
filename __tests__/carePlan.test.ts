import {
  parseMeasurementInput,
  isAppointmentPast,
  escapeHtml,
} from "../src/services/carePlan";
import { buildCalendarDoses } from "../src/services/calendarAgenda";
import { makeMedication, makeSchedule, makeDoseLog } from "./factories";

it.each(["72,5", "72.5"])(
  "accepts the entire localized measurement %s",
  (input) => {
    expect(parseMeasurementInput(input, "weight")).toBe(72.5);
  }
);
it.each(["72kg", "1,2,3", "0", "-1", "Infinity", ""])(
  "rejects invalid measurement %s",
  (input) => {
    expect(parseMeasurementInput(input, "weight")).toBeNull();
  }
);
it("limits oxygen saturation to 100 percent", () => {
  expect(parseMeasurementInput("100", "spo2")).toBe(100);
  expect(parseMeasurementInput("100,1", "spo2")).toBeNull();
});
it("compares appointment times in the local day and keeps untimed appointments upcoming", () => {
  const now = new Date(2026, 9, 9, 10, 0);
  expect(isAppointmentPast({ date: "2026-10-09", time: "09:30" }, now)).toBe(
    true
  );
  expect(isAppointmentPast({ date: "2026-10-09", time: "10:30" }, now)).toBe(
    false
  );
  expect(isAppointmentPast({ date: "2026-10-09" }, now)).toBe(false);
});
it("escapes content entered by a person before producing report HTML", () => {
  expect(escapeHtml("<img src=\"x\"/> & 'name'")).toBe(
    "&lt;img src=&quot;x&quot;/&gt; &amp; &#39;name&#39;"
  );
});
it("does not reconstruct unrecorded historical doses from a changed treatment", () => {
  expect(
    buildCalendarDoses(
      [makeMedication()],
      [makeSchedule()],
      [],
      "2026-10-08",
      {},
      new Date(2026, 9, 9, 10)
    )
  ).toEqual([]);
});
it("keeps an archived historical event and its recorded time when its schedule no longer exists", () => {
  const log = makeDoseLog({
    scheduledDate: "2026-10-08",
    scheduledTime: "11:45",
  });
  const doses = buildCalendarDoses(
    [makeMedication({ isActive: false, archivedAt: "2026-10-09" })],
    [],
    [log],
    "2026-10-08",
    {},
    new Date(2026, 9, 9, 10)
  );
  expect(doses).toHaveLength(1);
  expect(doses[0]).toMatchObject({
    status: "taken",
    scheduledTime: "11:45",
    doseLogId: log.id,
  });
});
it("carries an overnight snooze using its original date, then hides it once recorded", () => {
  const med = makeMedication(),
    schedule = makeSchedule({ time: "23:55" });
  const times = {
    "sch-1-2026-10-08": new Date(2026, 9, 9, 0, 15).toISOString(),
  };
  const now = new Date(2026, 9, 9, 0, 5);
  const doses = buildCalendarDoses(
    [med],
    [schedule],
    [],
    "2026-10-09",
    times,
    now
  );
  expect(doses.find((d) => d.scheduledDate === "2026-10-08")).toMatchObject({
    status: "pending",
    snoozedUntil: times["sch-1-2026-10-08"],
  });
  const recorded = buildCalendarDoses(
    [med],
    [schedule],
    [makeDoseLog({ scheduledDate: "2026-10-08" })],
    "2026-10-09",
    times,
    now
  );
  expect(recorded.some((d) => d.scheduledDate === "2026-10-08")).toBe(false);
  expect(
    buildCalendarDoses(
      [makeMedication({ isActive: false })],
      [schedule],
      [],
      "2026-10-09",
      times,
      now
    )
  ).toEqual([]);
});
