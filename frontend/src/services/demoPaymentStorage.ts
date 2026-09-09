import type { DemoPaymentMap, DemoPaymentRecord, DemoPaymentStatus, DemoPaymentMethod } from "@/types/payment";

export const DEMO_PAYMENT_STORAGE_KEY = "powermanage.demo-payments.v1";
export const DEMO_PAYMENT_CHANGE_EVENT = "powermanage-demo-payment-change";

const paymentStatuses: DemoPaymentStatus[] = ["pending", "paid", "failed"];
const paymentMethods: DemoPaymentMethod[] = ["upi", "card", "net_banking"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string" ? value : null;
}

function nullableAmount(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0) ? value : null;
}

function sanitizePayment(value: unknown): DemoPaymentRecord | null {
  if (!isRecord(value) || typeof value.billId !== "number" || !Number.isInteger(value.billId) || value.billId < 1 || typeof value.invoiceNumber !== "string") {
    return null;
  }

  const status = paymentStatuses.includes(value.status as DemoPaymentStatus) ? value.status as DemoPaymentStatus : null;
  if (!status) return null;

  const method = value.method === null || value.method === undefined
    ? null
    : paymentMethods.includes(value.method as DemoPaymentMethod)
      ? value.method as DemoPaymentMethod
      : null;
  return {
    billId: value.billId,
    invoiceNumber: value.invoiceNumber,
    status,
    method,
    transactionId: nullableString(value.transactionId),
    paidAmount: nullableAmount(value.paidAmount),
    paidAt: nullableString(value.paidAt),
    failedAt: nullableString(value.failedAt),
  };
}

function readPayments(): DemoPaymentMap {
  if (typeof window === "undefined") return {};

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEMO_PAYMENT_STORAGE_KEY) ?? "{}");
    if (!isRecord(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, sanitizePayment(value)] as const)
        .filter((entry): entry is readonly [string, DemoPaymentRecord] => entry[1] !== null),
    );
  } catch {
    return {};
  }
}

function notifyPaymentChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEMO_PAYMENT_CHANGE_EVENT));
}

export function getDemoPayment(billId: number) {
  return readPayments()[String(billId)] ?? null;
}

export function listDemoPayments() {
  return readPayments();
}

export function saveDemoPayment(payment: DemoPaymentRecord) {
  if (typeof window === "undefined") return;

  const safePayment = sanitizePayment(payment);
  if (!safePayment) throw new Error("Unable to save the demo payment.");

  const next = readPayments();
  next[String(safePayment.billId)] = safePayment;
  window.localStorage.setItem(DEMO_PAYMENT_STORAGE_KEY, JSON.stringify(next));
  notifyPaymentChange();
}

export function subscribeToDemoPayments(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = () => listener();
  window.addEventListener(DEMO_PAYMENT_CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(DEMO_PAYMENT_CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

export function getEffectivePaymentStatus(bill: { id: number; status: string }, payment: DemoPaymentRecord | null | undefined): DemoPaymentStatus {
  // The API invoice status is authoritative. Local storage is only a cache of
  // non-sensitive demo metadata and may be edited by a user or stale on a
  // different device. A failed local attempt can be shown until the next API
  // refresh, but it can never turn an unpaid invoice into a paid one.
  if (bill.status === "paid") return "paid";
  if (payment?.status === "failed") return "failed";
  return "pending";
}

export function paymentMethodLabel(method: DemoPaymentMethod | null | undefined) {
  if (method === "upi") return "UPI";
  if (method === "card") return "Debit / Credit Card";
  if (method === "net_banking") return "Net Banking";
  return "Recorded payment";
}

export function createDemoTransactionId(date = new Date()) {
  const suffix = Math.floor(Math.random() * 10_000).toString().padStart(4, "0");
  return `DEMO-PAY-${date.getFullYear()}-${suffix}`;
}
