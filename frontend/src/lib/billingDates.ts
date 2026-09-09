import type { BillingRunMetadata, InvoiceMetadata } from "@/types/electricity";

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDefaultBillingDates(today = new Date()) {
  const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const dueDate = new Date(periodEnd);
  dueDate.setDate(dueDate.getDate() + 15);

  return {
    period_start: toDateInputValue(periodStart),
    period_end: toDateInputValue(periodEnd),
    due_date: toDateInputValue(dueDate),
  };
}

export function createDefaultInvoiceMetadata(): InvoiceMetadata {
  return {
    recipient_label: "Current customer",
    property_label: "Current workspace",
    unit_label: "Main meter",
    ...createDefaultBillingDates(),
  };
}

export function createDefaultBillingRunMetadata(): BillingRunMetadata {
  return {
    property_label: "Current workspace",
    unit_label: "Main meter",
    owner_recipient_label: "Owner / Common Area",
    ...createDefaultBillingDates(),
  };
}

export function isValidBillingDateRange(metadata: {
  period_start: string;
  period_end: string;
  due_date: string;
}): boolean {
  return Boolean(
    metadata.period_start
      && metadata.period_end
      && metadata.due_date
      && metadata.period_start <= metadata.period_end
      && metadata.period_end <= metadata.due_date,
  );
}
