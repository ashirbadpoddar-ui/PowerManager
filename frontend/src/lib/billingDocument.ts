import type { Bill, BreakdownItem } from "@/types/electricity";
import type { MyBill } from "@/types/portal";
import { paymentMethodLabel } from "@/services/demoPaymentStorage";

type Numeric = number | string | null | undefined;
function numeric(value: Numeric) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function formatUnits(value: Numeric) {
  const number = numeric(value);
  return number === null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number);
}
export function formatCurrency(value: Numeric) {
  const number = numeric(value);
  return number === null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}
export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  // Calendar dates do not shift time zones; persisted timestamps are shown in India time.
  // SQLite may return the server's UTC timestamps without their timezone suffix.
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? `${value}Z` : value;
  const date = new Date(dateOnly ? `${value}T00:00:00+05:30` : timestamp);
  if (!Number.isFinite(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date).replace("Sept", "Sep");
  if (!withTime || dateOnly) return day;
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date);
  return `${day}, ${time}`;
}

export type DocumentBill = {
  id: number; invoice: string; status: string; submitter: string; property: string;
  periodStart: string; periodEnd: string; issuedAt: string; dueDate: string;
  previous: Numeric; current: Numeric; units: Numeric; rate: Numeric;
  rateMode?: string | null; tariffLabel?: string; breakdown?: BreakdownItem[];
  meter?: string | null; amount: Numeric; method?: "upi" | "card" | "net_banking" | null;
  transaction?: string | null; paidAt?: string | null;
};
export function documentBill(bill: Bill | MyBill): DocumentBill {
  const admin = "bill_number" in bill;
  return {
    id: bill.id, invoice: admin ? bill.bill_number : bill.invoice_number, status: bill.status,
    submitter: admin ? bill.recipient_label : bill.submitter_name,
    property: [admin ? bill.property_label : bill.property_name, admin ? bill.unit_label : bill.unit].filter(Boolean).join(" - ") || "Not recorded",
    periodStart: admin ? bill.period_start : bill.billing_period_start,
    periodEnd: admin ? bill.period_end : bill.billing_period_end,
    issuedAt: bill.issued_at, dueDate: bill.due_date,
    previous: bill.previous_reading, current: bill.current_reading,
    units: admin ? bill.total_units : bill.units, rate: bill.rate_per_unit,
    rateMode: bill.rate_mode, tariffLabel: admin ? undefined : bill.tariff_label,
    breakdown: bill.breakdown, meter: bill.meter_name, amount: bill.total_amount,
    method: bill.payment_method, transaction: bill.transaction_id, paidAt: bill.paid_at,
  };
}
export type DocumentField = { label: string; value: string };
export type BillingDocumentData = {
  kind: "invoice" | "receipt"; title: string; reference: string; status: string;
  metadata: DocumentField[]; customer: DocumentField[]; readings: DocumentField[];
  tariff: DocumentField[]; summary: DocumentField[]; emphasis: DocumentField;
  disclaimer: string | null;
};
export function billingDocumentData(bill: DocumentBill, kind: "invoice" | "receipt"): BillingDocumentData {
  if (kind === "receipt" && bill.status !== "paid") throw new Error("A receipt is available only after payment is confirmed by the server.");
  const receipt = kind === "receipt";
  const field = (label: string, value: string): DocumentField => ({ label, value });
  const receiptId = `RCPT-${bill.id.toString().padStart(6, "0")}`;
  const manual = numeric(bill.rate) !== null;
  const tariff = manual ? `${formatCurrency(bill.rate)} / unit` : bill.rateMode === "slab" || bill.breakdown?.length ? "Auto Slab" : bill.tariffLabel && bill.tariffLabel !== "Configured electricity tariff" ? bill.tariffLabel : "Not recorded on this invoice";
  return {
    kind, title: receipt ? "Payment receipt" : "Electricity Invoice", reference: receipt ? receiptId : bill.invoice, status: bill.status,
    metadata: receipt ? [field("Receipt ID", receiptId), field("Invoice ID", bill.invoice), field("Transaction ID", bill.transaction || "Not recorded"), field("Paid on", formatDate(bill.paidAt, true))] : [field("Invoice ID", bill.invoice), field("Billing period", `${formatDate(bill.periodStart)} – ${formatDate(bill.periodEnd)}`), field("Generated date", formatDate(bill.issuedAt, true)), field("Due date", formatDate(bill.dueDate))],
    customer: [field("Submitter", bill.submitter), field("Property / room", bill.property), ...(bill.meter ? [field("Meter number", bill.meter)] : []), ...(receipt ? [field("Billing period", `${formatDate(bill.periodStart)} – ${formatDate(bill.periodEnd)}`)] : [])],
    readings: [field("Previous reading", formatUnits(bill.previous)), field("Current reading", formatUnits(bill.current)), field("Units consumed", `${formatUnits(bill.units)} units`)],
    tariff: [field(manual ? "Rate per unit" : "Rate mode", tariff), ...(bill.breakdown ?? []).map(item => field(item.slab_label, `${formatUnits(item.units_in_slab)} units × ${formatCurrency(item.rate_per_unit)} = ${formatCurrency(item.amount)}`))],
    summary: [field("Bill amount", formatCurrency(bill.amount)), ...(receipt ? [field("Payment method", paymentMethodLabel(bill.method)), field("Payment status", "PAID")] : [])],
    emphasis: field(receipt ? "Amount paid" : "Amount due", formatCurrency(receipt ? bill.amount : bill.status === "paid" || bill.status === "void" ? 0 : bill.amount)),
    disclaimer: receipt ? bill.transaction?.startsWith("DEMO-PAY-") ? "Demo receipt — No real payment was processed. No money was transferred. This receipt is not proof of real payment." : "Administrator-recorded payment. This receipt does not provide payment gateway verification." : null,
  };
}
