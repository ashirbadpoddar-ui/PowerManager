import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MyBills, MyInvoiceDetail } from "@/components/user/MyBills";
import { saveDemoPayment } from "@/services/demoPaymentStorage";
import type { MyBill } from "@/types/portal";

vi.mock("@/services/portalApi", () => ({
  listMyBills: vi.fn(),
  getMyBill: vi.fn(),
}));

import { getMyBill, listMyBills } from "@/services/portalApi";

const unpaidBill: MyBill = {
  id: 21,
  invoice_number: "INV-021",
  submitter_name: "Asha Patel",
  property_name: "Sunrise Apartments",
  unit: "A-12",
  billing_period_start: "2026-08-01",
  billing_period_end: "2026-08-31",
  issued_at: "2026-09-01T00:00:00Z",
  due_date: "2026-09-10",
  status: "overdue",
  previous_reading: 100,
  current_reading: 200,
  units: 100,
  rate_per_unit: 5,
  tariff_label: "Manual rate",
  total_amount: 500,
};

const paidBill = { ...unpaidBill, id: 22, invoice_number: "INV-022", status: "paid" as const };

describe("MyBills demo payment presentation", () => {
  it("shows Pay now only for unpaid Pending or Overdue bills", async () => {
    vi.mocked(listMyBills).mockResolvedValue({ items: [unpaidBill, paidBill], total: 2 });
    render(<MyBills onOpen={vi.fn()} onPay={vi.fn()} onReceipt={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByText("INV-021").length).toBeGreaterThan(0));
    expect(screen.getAllByRole("button", { name: "Pay now" })).toHaveLength(2);
    expect(screen.getAllByText("Payment pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Payment paid").length).toBeGreaterThan(0);
  });

  it("does not let local demo metadata promote an unpaid server bill", async () => {
    saveDemoPayment({
      billId: unpaidBill.id,
      invoiceNumber: unpaidBill.invoice_number,
      status: "paid",
      method: "upi",
      transactionId: "DEMO-PAY-2026-0001",
      paidAmount: unpaidBill.total_amount,
      paidAt: "2026-09-02T10:00:00.000Z",
      failedAt: null,
    });
    vi.mocked(listMyBills).mockResolvedValue({ items: [unpaidBill], total: 1 });
    render(<MyBills onOpen={vi.fn()} onPay={vi.fn()} onReceipt={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByText("Payment pending").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Pay now" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Receipt" })).not.toBeInTheDocument();
  });
});


describe("Invoice payment refresh", () => {
  it("refreshes the authoritative invoice after payment and replaces Pay now with the receipt action", async () => {
    vi.mocked(getMyBill).mockResolvedValueOnce(unpaidBill).mockResolvedValueOnce({ ...unpaidBill, status: "paid" });
    render(<MyInvoiceDetail billId={unpaidBill.id} onBack={vi.fn()} onPay={vi.fn()} onReceipt={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Pay now" })).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event("powermanage-bill-change")); });
    expect(await screen.findByRole("button", { name: "View receipt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay now" })).not.toBeInTheDocument();
    expect(screen.getByText("\u20b90.00")).toBeInTheDocument();
  });
});
