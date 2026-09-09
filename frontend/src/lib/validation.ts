import { z } from "zod";

const finiteNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : value;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const requiredNonNegativeNumber = (message: string) => z.preprocess(
  finiteNumber,
  z.number({ invalid_type_error: message }).finite(message).min(0, message),
);

const requiredPositiveNumber = (message: string) => z.preprocess(
  finiteNumber,
  z.number({ invalid_type_error: message }).finite(message).positive(message),
);

const optionalNonNegativeNumber = z.preprocess(
  finiteNumber,
  z.number().finite("Enter a valid number.").min(0, "Value cannot be negative.").optional(),
);

export const slabSchema = z
  .object({
    min_units: requiredNonNegativeNumber("Minimum units must be 0 or greater."),
    max_units: optionalNonNegativeNumber,
    rate_per_unit: requiredPositiveNumber("Rate per unit must be greater than zero."),
  })
  .superRefine((slab, ctx) => {
    if (slab.max_units !== null && slab.max_units !== undefined && slab.max_units <= slab.min_units) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum units must be greater than minimum units.",
        path: ["max_units"],
      });
    }
  });

export const tariffSettingsSchema = z.object({
  slabs: z.array(slabSchema).min(1, "At least one slab is required."),
}).superRefine((data, ctx) => {
  if (data.slabs[0]?.min_units !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The first slab must start at 0 units.",
      path: ["slabs", 0, "min_units"],
    });
  }

  for (let index = 0; index < data.slabs.length; index += 1) {
    const current = data.slabs[index];
    const next = data.slabs[index + 1];
    if (current.max_units == null && index !== data.slabs.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only the final slab may be unlimited.",
        path: ["slabs", index, "max_units"],
      });
    }
    if (next && current.max_units !== next.min_units) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slabs must be ordered and contiguous.",
        path: ["slabs"],
      });
    }
  }
});

export const billFormSchema = z
  .object({
    units: requiredPositiveNumber("Units consumed must be greater than 0."),
    fixed_charge: requiredNonNegativeNumber("Fixed charge cannot be negative."),
    tax_rate: z.preprocess(
      finiteNumber,
      z.number({ invalid_type_error: "Enter a valid tax rate." })
        .finite("Enter a valid tax rate.")
        .min(0, "Tax rate cannot be negative.")
        .max(100, "Tax rate cannot exceed 100%.")
    ),
    slabs: z.array(slabSchema).min(1, "At least one slab is required."),
  })
  .superRefine((data, ctx) => {
    if (data.slabs[0]?.min_units !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The first slab must start at 0 units.",
        path: ["slabs", 0, "min_units"],
      });
    }

    for (let index = 0; index < data.slabs.length; index += 1) {
      const current = data.slabs[index];
      const next = data.slabs[index + 1];
      if (current.max_units == null && index !== data.slabs.length - 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only the final slab may be unlimited.",
          path: ["slabs", index, "max_units"],
        });
      }
      if (next && current.max_units !== next.min_units) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Slabs must be ordered and contiguous.",
          path: ["slabs"],
        });
      }
    }
  });

export type SlabFormSchema = z.infer<typeof slabSchema>;
export type BillFormSchema = z.infer<typeof billFormSchema>;
export type TariffSettingsSchema = z.infer<typeof tariffSettingsSchema>;
