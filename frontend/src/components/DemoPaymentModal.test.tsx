import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoPaymentModal } from "@/components/DemoPaymentModal";
import { getDemoPayment } from "@/services/demoPaymentStorage";
import type { MyBill } from "@/types/portal";

const bill: MyBill = {
  id: 12,
  invoice_number: "INV-012",
  submitter_name: "Asha Patel",
  property_name: "Sunrise Apartments",
  unit: "A-12",
  billing_period_start: "2026-08-01",
  billing_period_end: "2026-08-31",
  issued_at: "2026-09-01T00:00:00Z",
  due_date: "2026-09-10",
  status: "pending",
  previous_reading: 100,
  current_reading: 200,
  units: 100,
  rate_per_unit: 5,
  tariff_label: "Manual rate",
  total_amount: 500,
};

afterEach(() => vi.useRealTimers());

describe("DemoPaymentModal", () => {
  it("completes a demo payment and exposes a receipt action", () => {
    vi.useFakeTimers();
    const onReceipt = vi.fn();
    render(<DemoPaymentModal bill={bill} onClose={vi.fn()} onReceipt={onReceipt} />);

    expect(screen.getByText("Demo payment only. Do not enter real payment details.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /UPI.*demo@upi/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm demo payment" }));
    expect(screen.getByText("Processing demo payment")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1_400); });
    expect(screen.getByText("Payment Successful")).toBeInTheDocument();
    expect(screen.getByText(/DEMO-PAY-2026-\d{4}/)).toBeInTheDocument();
    expect(getDemoPayment(12)?.status).toBe("paid");

    fireEvent.click(screen.getByRole("button", { name: "View receipt" }));
    expect(onReceipt).toHaveBeenCalledWith(12);
  });

  it("records a failed attempt without making the bill paid", () => {
    vi.useFakeTimers();
    render(<DemoPaymentModal bill={bill} onClose={vi.fn()} onReceipt={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Debit \/ Credit Card/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Simulate failed payment for testing" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm demo payment" }));
    act(() => { vi.advanceTimersByTime(1_400); });

    expect(screen.getByText("Payment Failed")).toBeInTheDocument();
    expect(screen.getByText(/Your bill remains unpaid/)).toBeInTheDocument();
    expect(getDemoPayment(12)?.status).toBe("failed");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
