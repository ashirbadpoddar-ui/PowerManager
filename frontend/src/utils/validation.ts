import { z } from "zod";

const finiteNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : value;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const requiredNonNegativeInteger = (message: string) => z.preprocess(
  finiteNumber,
  z.number({ invalid_type_error: message }).finite(message).int(message).min(0, message),
);

const requiredNonNegativeNumber = (message: string) => z.preprocess(
  finiteNumber,
  z.number({ invalid_type_error: message }).finite(message).min(0, message),
);

const optionalMaxUnits = z.preprocess(
  finiteNumber,
  z.number().finite("Enter a valid maximum.").int("Maximum units must be a whole number.").min(0, "Maximum units cannot be negative.").nullable().optional(),
);

// Single electricity slab validation
export const slabSchema = z
  .object({
    min_units: requiredNonNegativeInteger("Minimum units must be 0 or greater."),

    max_units: optionalMaxUnits,

    rate_per_unit: requiredNonNegativeNumber("Rate per unit cannot be negative."),
  })
  .refine(
    (slab) => {
      if (slab.max_units == null) {
        return true;
      }

      return slab.max_units >= slab.min_units;
    },
    {
      message: "Maximum units must be greater than minimum units.",
      path: ["max_units"],
    }
  );

// Entire bill form validation
export const billFormSchema = z
  .object({
    units: z.preprocess(
      finiteNumber,
      z.number({ invalid_type_error: "Enter units consumed." })
        .finite("Enter a valid units value.")
        .int("Units must be a whole number.")
        .min(1, "Units must be greater than 0."),
    ),

    fixed_charge: requiredNonNegativeNumber("Fixed charge cannot be negative."),

    tax_rate: requiredNonNegativeNumber("Tax rate cannot be negative."),

    slabs: z
      .array(slabSchema)
      .min(1, "Add at least one electricity slab."),
  })
  .refine(
    (data) => {
      const slabs = [...data.slabs].sort(
        (a, b) => a.min_units - b.min_units
      );

      for (let i = 0; i < slabs.length - 1; i++) {
        const current = slabs[i];
        const next = slabs[i + 1];

        // Infinite/open-ended slab must be last
        if (current.max_units == null) {
          return false;
        }

        // Prevent overlapping slabs
        if (next.min_units <= current.max_units) {
          return false;
        }
      }

      return true;
    },
    {
      message: "Electricity slabs cannot overlap.",
      path: ["slabs"],
    }
  );

export type SlabFormSchema = z.infer<typeof slabSchema>;
export type BillFormSchema = z.infer<typeof billFormSchema>;
