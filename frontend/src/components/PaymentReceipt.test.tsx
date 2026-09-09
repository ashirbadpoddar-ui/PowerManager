import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PaymentReceipt } from "@/components/PaymentReceipt";
import type { MyBill } from "@/types/portal";

const bill: MyBill = {
  id: 31,
  invoice_number: "INV-031",
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

describe("PaymentReceipt", () => {
  it("distinguishes administrator confirmation from demo payment", () => {
    const { rerender } = render(<PaymentReceipt bill={{ ...bill, status: "paid" }} payment={null} onBack={vi.fn()} />);
    expect(screen.getByText(/Administrator-recorded payment/)).toBeInTheDocument();
    expect(screen.queryByText(/No money was transferred/)).not.toBeInTheDocument();
    rerender(<PaymentReceipt bill={{ ...bill, status: "paid", transaction_id: "DEMO-PAY-TEST" }} payment={null} onBack={vi.fn()} />);
    expect(screen.getByText(/No money was transferred/)).toBeInTheDocument();
  });

  it("renders paid metadata and delegates print to the browser", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<PaymentReceipt bill={{ ...bill, status: "paid", payment_method: "upi", transaction_id: "DEMO-PAY-2026-0001", paid_at: "2026-09-02T10:00:00.000Z" }} payment={{ billId: 31, invoiceNumber: "INV-031", status: "paid", method: "upi", transactionId: "DEMO-PAY-2026-0001", paidAmount: 500, paidAt: "2026-09-02T10:00:00.000Z", failedAt: null }} onBack={vi.fn()} />);

    expect(screen.getByText("Payment receipt")).toBeInTheDocument();
    expect(screen.getByText("DEMO-PAY-2026-0001")).toBeInTheDocument();
    expect(screen.getAllByText(/PAID/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Print Receipt" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});


it("does not print a receipt based on an unconfirmed local payment", () => {
  render(<PaymentReceipt bill={bill} payment={{ billId: bill.id, invoiceNumber: bill.invoice_number, status: "paid", method: "card", transactionId: "DEMO-PAY-FAKE", paidAmount: 9999, paidAt: "2026-09-08T09:41:00Z", failedAt: null }} onBack={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("after payment is confirmed");
  expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
});
