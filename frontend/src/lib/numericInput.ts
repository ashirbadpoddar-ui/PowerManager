export const INTEGER_INPUT_PATTERN = /^\d*$/;
export const DECIMAL_INPUT_PATTERN = /^\d*\.?\d*$/;

export function isIntegerInput(value: string): boolean {
  return INTEGER_INPUT_PATTERN.test(value);
}

export function isDecimalInput(value: string): boolean {
  return DECIMAL_INPUT_PATTERN.test(value);
}

export function parseFiniteInput(value: string): number | undefined {
  if (value === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseNonNegativeInput(value: string): number | undefined {
  const parsed = parseFiniteInput(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}
