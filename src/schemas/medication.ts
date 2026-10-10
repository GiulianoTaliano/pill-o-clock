import { z } from "zod";

const scheduleInputSchema = z.object({
  id: z.string(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  days: z.array(z.number().int().min(0).max(6)),
});

export const medicationFormSchema = z
  .object({
    name: z.string().trim().min(1, "form.errorNameRequiredMsg"),
    dosageAmount: z.string().min(1, "form.errorDoseRequiredMsg"),
    dosageUnit: z.enum([
      "mg",
      "g",
      "mcg",
      "ml",
      "gotas",
      "comprimidos",
      "capsulas",
      "UI",
    ]),
    category: z.enum([
      "antibiotico",
      "analgesico",
      "antiinflamatorio",
      "suplemento",
      "vitamina",
      "otro",
    ]),
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
    rxcui: z.string().optional(),
    // Complex regimen (F3) — only meaningful in "repeat" mode.
    regimenType: z
      .enum(["none", "everyN", "cycle", "taper", "monthlyDay"])
      .default("none"),
    regimenNStr: z.string().optional().default(""),
    regimenOnStr: z.string().optional().default(""),
    regimenOffStr: z.string().optional().default(""),
    regimenMonthDayStr: z.string().optional().default(""),
    taperSteps: z
      .array(z.object({ daysStr: z.string(), amountStr: z.string() }))
      .default([]),
    // Injectable flag (F3): enables site rotation + weekly countdown.
    isInjectable: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // Validate dosage is a positive number
    const numeric = (value?: string) => {
      const normalized = (value ?? "").trim().replace(",", ".");
      return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
    };
    const parsed = numeric(data.dosageAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorDoseRequiredMsg",
        path: ["dosageAmount"],
      });
    }

    for (const field of [
      "stockQtyStr",
      "stockThreshStr",
      "prnMaxStr",
      "prnIntervalHoursStr",
    ] as const) {
      const value = data[field]?.trim();
      if (!value || (field.startsWith("prn") && data.repeatMode !== "prn"))
        continue;
      const number = numeric(value);
      const isInterval = field === "prnIntervalHoursStr";
      const minimum = field.startsWith("prn") ? Number.MIN_VALUE : 0;
      if (
        !Number.isFinite(number) ||
        number < minimum ||
        (!isInterval && !Number.isInteger(number)) ||
        number > 1_000_000
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "uxMedication.invalidNumber",
          path: [field],
        });
      }
    }

    if (
      data.repeatMode === "once" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(data.onceDate ?? "")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "uxMedication.dateRequired",
        path: ["onceDate"],
      });
    }

    const schedules =
      data.repeatMode === "once" ? data.schedules.slice(0, 1) : data.schedules;
    if (data.repeatMode !== "prn") {
      for (let i = 0; i < schedules.length; i++) {
        for (let j = 0; j < i; j++) {
          const a = schedules[i];
          const b = schedules[j];
          const overlap =
            data.regimenType !== "none" ||
            a.days.length === 0 ||
            b.days.length === 0 ||
            a.days.some((day) => b.days.includes(day));
          if (a.time === b.time && overlap) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "uxMedication.duplicateSchedule",
              path: ["schedules"],
            });
          }
        }
      }
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
    if (
      data.repeatMode === "repeat" &&
      data.regimenType === "none" &&
      data.schedules.some((s) => s.days.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorNoDaysMsg",
        path: ["schedules"],
      });
    }

    // Complex regimen validation (F3, repeat mode only)
    if (data.repeatMode === "repeat") {
      const int = (v?: string) => {
        const value = /^\d+$/.test((v ?? "").trim()) ? Number(v) : NaN;
        return Number.isSafeInteger(value) ? value : NaN;
      };
      if (data.regimenType === "everyN" && !(int(data.regimenNStr) >= 2)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "form.errorRegimenNMsg",
          path: ["regimenNStr"],
        });
      }
      if (
        data.regimenType === "cycle" &&
        (!(int(data.regimenOnStr) >= 1) || !(int(data.regimenOffStr) >= 1))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "form.errorRegimenCycleMsg",
          path: ["regimenOnStr"],
        });
      }
      if (data.regimenType === "taper") {
        const ok =
          data.taperSteps.length >= 1 &&
          data.taperSteps.every((st) => {
            const days = int(st.daysStr);
            const amount = numeric(st.amountStr);
            return (
              Number.isFinite(days) &&
              days >= 1 &&
              Number.isFinite(amount) &&
              amount > 0
            );
          });
        if (!ok) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "form.errorRegimenTaperMsg",
            path: ["taperSteps"],
          });
        }
      }
      if (data.regimenType === "monthlyDay") {
        const day = int(data.regimenMonthDayStr);
        if (!(day >= 1 && day <= 31)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "form.errorRegimenMonthDayMsg",
            path: ["regimenMonthDayStr"],
          });
        }
      }
    }

    // Date range check (repeat mode only)
    if (
      data.repeatMode === "repeat" &&
      data.startDate &&
      data.endDate &&
      data.endDate < data.startDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "form.errorInvalidPeriodMsg",
        path: ["endDate"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    schedules:
      data.repeatMode === "once"
        ? data.schedules.slice(0, 1)
        : data.repeatMode === "prn"
        ? []
        : data.schedules,
  }));

// Input vs output diverge because of the .default() fields: they are optional
// before parsing and guaranteed after. useForm needs both sides (rhf >= 7.55).
export type MedicationFormInput = z.input<typeof medicationFormSchema>;
export type MedicationFormData = z.output<typeof medicationFormSchema>;
