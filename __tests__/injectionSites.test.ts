/**
 * Injection-site rotation + weekly countdown (F3 injectables).
 */
import { suggestNextSite, nextDueDate, INJECTION_SITES } from "../src/services/injectionSites";
import { makeMedication, makeSchedule, makeDoseLog } from "./factories";

describe("suggestNextSite", () => {
  it("suggests the first site with no history", () => {
    expect(suggestNextSite([])).toBe("abdomen_l");
  });

  it("suggests the first never-used site", () => {
    const logs = [
      makeDoseLog({ id: "l1", scheduledDate: "2026-07-01", injectionSite: "abdomen_l" }),
      makeDoseLog({ id: "l2", scheduledDate: "2026-07-08", injectionSite: "abdomen_r" }),
    ];
    expect(suggestNextSite(logs)).toBe("thigh_l");
  });

  it("falls back to the least-recently-used site when all were used", () => {
    const logs = INJECTION_SITES.map((site, i) =>
      makeDoseLog({
        id: `l${i}`,
        scheduledDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
        injectionSite: site,
      })
    );
    // abdomen_l was used on 07-01 → oldest → suggested again.
    expect(suggestNextSite(logs)).toBe("abdomen_l");
  });

  it("ignores logs without a site", () => {
    const logs = [
      makeDoseLog({ id: "l1", scheduledDate: "2026-07-01", injectionSite: "abdomen_l" }),
      makeDoseLog({ id: "l2", scheduledDate: "2026-07-08" }),
    ];
    expect(suggestNextSite(logs)).toBe("abdomen_r");
  });
});

describe("nextDueDate", () => {
  // Wednesday 2026-07-22.
  const NOW = new Date(2026, 6, 22, 12);

  it("finds the next weekly occurrence", () => {
    const med = makeMedication({ id: "m1", createdAt: "2026-06-01T00:00:00.000Z" });
    const sched = makeSchedule({ medicationId: "m1", days: [5] }); // Fridays
    expect(nextDueDate(med, [sched], NOW)).toEqual({ date: "2026-07-24", inDays: 2 });
  });

  it("returns null without active schedules", () => {
    const med = makeMedication({ id: "m1" });
    expect(nextDueDate(med, [], NOW)).toBeNull();
    const inactive = makeSchedule({ medicationId: "m1", days: [5], isActive: false });
    expect(nextDueDate(med, [inactive], NOW)).toBeNull();
  });

  it("respects the regimen gate (everyN)", () => {
    const med = makeMedication({
      id: "m1",
      createdAt: "2026-06-01T00:00:00.000Z",
      startDate: "2026-07-22",
      regimen: JSON.stringify({ type: "everyN", n: 7 }),
    });
    const daily = makeSchedule({ medicationId: "m1", days: [] });
    // Anchor 07-22 → next active day after today is 07-29.
    expect(nextDueDate(med, [daily], NOW)).toEqual({ date: "2026-07-29", inDays: 7 });
  });
});
