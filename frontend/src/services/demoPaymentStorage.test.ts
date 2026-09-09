import { describe, expect, it, vi } from "vitest";

import {
  DEMO_PAYMENT_STORAGE_KEY,
  getDemoPayment,
  getEffectivePaymentStatus,
  saveDemoPayment,
} from "@/services/demoPaymentStorage";

const payment = {
  billId: 7,
  invoiceNumber: "INV-007",
  status: "paid" as const,
  method: "card" as const,
  transactionId: "DEMO-PAY-2026-1234",
  paidAmount: 980,
  paidAt: "2026-09-02T10:00:00.000Z",
  failedAt: null,
};

describe("demoPaymentStorage", () => {
  it("persists only safe payment metadata and never card details", () => {
    saveDemoPayment({ ...payment, cardNumber: "4242 4242 4242 4242", cvv: "123" } as never);

    expect(getDemoPayment(7)).toEqual(payment);
    expect(window.localStorage.getItem(DEMO_PAYMENT_STORAGE_KEY)).not.toContain("4242");
    expect(window.localStorage.getItem(DEMO_PAYMENT_STORAGE_KEY)).not.toContain("cvv");
  });

  it("recovers from malformed localStorage data", () => {
    window.localStorage.setItem(DEMO_PAYMENT_STORAGE_KEY, "not-json");
    expect(getDemoPayment(7)).toBeNull();
    window.localStorage.setItem(DEMO_PAYMENT_STORAGE_KEY, JSON.stringify({ bad: { status: "paid" } }));
    expect(getDemoPayment(7)).toBeNull();
  });

  it("prefers a demo payment while keeping legacy bill status separate", () => {
    expect(getEffectivePaymentStatus({ id: 1, status: "pending" }, null)).toBe("pending");
    expect(getEffectivePaymentStatus({ id: 2, status: "paid" }, null)).toBe("paid");
    expect(getEffectivePaymentStatus({ id: 3, status: "overdue" }, { ...payment, billId: 3, status: "failed" })).toBe("failed");
  });

  it("notifies subscribers when payment metadata changes", () => {
    const listener = vi.fn();
    window.addEventListener("powermanage-demo-payment-change", listener);
    saveDemoPayment(payment);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("powermanage-demo-payment-change", listener);
  });
});
