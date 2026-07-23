import { z } from "zod";

const scheduleInputSchema = z.object({
  id: z.string(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  days: z.array(z.number().int().min(0).max(6)),
});

export const medicationFormSchema = z
  .object({
    name: z.string().trim().min(1, "form.errorNameRequiredMsg"),
    dosageAmount: z.string().min(1, "form.errorDoseRequiredMsg"),
    dosageUnit: z.enum(["mg", "g", "mcg", "ml", "gotas", "comprimidos", "capsulas", "UI"]),
    category: z.enum(["antibiotico", "analgesico", "antiinflamatorio", "suplemento", "vitamina", "otro"]),
    notes: z.string().optional().default(""),
    color: z.string(),
    repeatMode: z.enum(["once", "repeat", "prn"]),
    onceDate: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    schedules: z.array(scheduleInputSchema).min(0),
    stockQtyStr: z.string().optional().default(""),
    stockThreshStr: z.string().optional().default(""),
    photoUri: z.string().optional(),
    renewalDate: z.string().optional(),
    prnMaxStr: z.string().optional(),
    prnIntervalHoursStr: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Validate dosage is a positive number
    const parsed = parseFloat(data.dosageAmount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorDoseRequiredMsg",
        path: ["dosageAmount"],
      });
    }

    // Require at least one schedule for non-PRN modes
    if (data.repeatMode !== "prn" && data.schedules.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorNoAlarmsMsg",
        path: ["schedules"],
      });
    }

    // In "repeat" mode every schedule must have at least one weekday selected.
    // An empty day set is stored as [] which the scheduler treats as "every
    // day" (isScheduleActiveOnDate), so clearing all days would silently turn a
    // specific-days reminder into a daily alarm (audit C3). "Every day" is
    // represented in the form as all 7 days selected (length 7), not [].
    if (data.repeatMode === "repeat" && data.schedules.some((s) => s.days.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorNoDaysMsg",
        path: ["schedules"],
      });
    }

    // Date range check (repeat mode only)
    if (data.repeatMode === "repeat" && data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorInvalidPeriodMsg",
        path: ["endDate"],
      });
    }
  });

export type MedicationFormData = z.infer<typeof medicationFormSchema>;
