import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecentBills } from "@/components/RecentBills";
import { saveDemoPayment } from "@/services/demoPaymentStorage";

describe("RecentBills", () => {
  it("labels persisted demo receipts as simulations", () => {
    render(<RecentBills total={1} bills={[{
      id: 1, bill_number: "INV-DEMO", recipient_label: "Recipient",
      calculation_type: "submitter", total_amount: 100, total_units: 20,
      status: "paid", payment_method: "upi", transaction_id: "DEMO-PAY-TEST",
      paid_at: "2026-09-02T10:00:00Z", period_start: "2026-08-01",
      period_end: "2026-08-31", due_date: "2026-09-10", issued_at: "2026-09-01T00:00:00Z",
    }] as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Receipt" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("No money was transferred");
    expect(screen.getByRole("dialog")).toHaveTextContent("not proof of real payment");
  });

  it("filters invoices by invoice id, submitter, property and clears the query", () => {
    const bills = [{
      id: 10,
      bill_number: "INV-2026-0001",
      recipient_label: "Rahul Sharma",
      property_label: "Room 101",
      unit_label: "Meter A",
      calculation_type: "main_meter",
      total_amount: 1400,
      total_units: 200,
      status: "pending",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      due_date: "2026-09-10",
      issued_at: "2026-09-01T00:00:00Z",
    }] as never;

    const { rerender } = render(<RecentBills total={1} bills={bills} searchQuery="rahul" />);
    expect(screen.getByTestId("invoice-card")).toHaveTextContent("INV-2026-0001");

    rerender(<RecentBills total={1} bills={bills} searchQuery="0001" />);
    expect(screen.getByTestId("invoice-card")).toHaveTextContent("Rahul Sharma");

    rerender(<RecentBills total={1} bills={bills} searchQuery="room 101" />);
    expect(screen.getByTestId("invoice-card")).toHaveTextContent("Room 101");

    rerender(<RecentBills total={1} bills={bills} searchQuery="xyz123" />);
    expect(screen.getByText("No results found for 'xyz123'.")).toBeInTheDocument();

    rerender(<RecentBills total={1} bills={bills} searchQuery="" />);
    expect(screen.getByTestId("invoice-card")).toBeInTheDocument();
  });

  it("renders invoice records as stacked cards with the essential billing details", () => {
    render(<RecentBills total={1} bills={[{
      id: 1,
      bill_number: "INV-001",
      recipient_label: "Asha Patel",
      property_label: "Sunrise Apartments",
      unit_label: "A-12",
      calculation_type: "main_meter",
      total_amount: 1250,
      total_units: 125,
      status: "pending",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      due_date: "2026-09-10",
      issued_at: "2026-09-01T00:00:00Z",
    }] as never} />);

    expect(screen.getByTestId("invoice-card")).toHaveTextContent("INV-001");
    expect(screen.getByTestId("invoice-card")).toHaveTextContent("Asha Patel");
    expect(screen.getByTestId("invoice-card")).toHaveTextContent("Billing period");
    expect(screen.getByRole("button", { name: "Mark INV-001 as paid" })).toBeInTheDocument();
  });

  it("does not trust local demo status for an unpaid server invoice", async () => {
    saveDemoPayment({
      billId: 1,
      invoiceNumber: "INV-001",
      status: "paid",
      method: "upi",
      transactionId: "DEMO-PAY-2026-0001",
      paidAmount: 1250,
      paidAt: "2026-09-02T10:00:00.000Z",
      failedAt: null,
    });
    render(<RecentBills total={1} bills={[{
      id: 1,
      bill_number: "INV-001",
      recipient_label: "Asha Patel",
      property_label: "Sunrise Apartments",
      unit_label: "A-12",
      calculation_type: "main_meter",
      total_amount: 1250,
      total_units: 125,
      status: "pending",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      due_date: "2026-09-10",
      issued_at: "2026-09-01T00:00:00Z",
    }] as never} />);

    expect(await screen.findByText("Payment Pending")).toBeInTheDocument();
    expect(screen.queryByText("UPI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receipt" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Payment" }));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("DEMO-PAY-2026-0001");
  });
});
