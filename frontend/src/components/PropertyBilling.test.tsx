import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PropertyBilling } from "@/components/PropertyBilling";
import { generateSubmitterBill } from "@/services/electricityApi";

vi.mock("@/services/electricityApi", () => ({
  generateSubmitterBill: vi.fn(),
}));

const property = {
  id: 1,
  created_by_user_id: 9,
  name: "Room 101",
  place: "Building A",
  unit: "101",
  submitters: [{ id: 4, property_id: 1, name: "Rahul Sharma", user_id: 12, created_at: "", updated_at: "" }],
  submitter_count: 1,
  created_at: "",
  updated_at: "",
};

const reading = {
  id: 8,
  property_id: 1,
  property_name: "Room 101",
  submitter_id: 4,
  submitter_name: "Rahul Sharma",
  meter_name: "Main Meter",
  previous_reading: 1000,
  current_reading: 1200,
  units_used: 200,
  reading_date: "2026-09-02",
  created_at: "",
  updated_at: "",
};

describe("PropertyBilling", () => {
  it.each(["scheduled", "not_available"] as const)("shows accurate notification status: %s", async (emailStatus) => {
    const onBillGenerated = vi.fn();
    vi.mocked(generateSubmitterBill).mockResolvedValue({
      id: 31,
      bill_number: "INV-2026-0001",
      created_by_user_id: 9,
      billing_run_id: null,
      tariff_id: 52,
      submitter_id: 4,
      calculation_type: "submitter",
      recipient_label: "Rahul Sharma",
      property_label: "Room 101",
      unit_label: "101",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      issued_at: "2026-09-02T00:00:00Z",
      due_date: "2026-10-10",
      status: "pending",
      total_units: 200,
      energy_amount: 1400,
      fixed_charge: 0,
      extra_charges: 0,
      subtotal: 1400,
      tax_rate: 0,
      tax_amount: 0,
      total_amount: 1400,
      email_status: emailStatus,
      paid_at: null,
      voided_at: null,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    });

    render(<PropertyBilling property={property} readings={[reading]} tariff={[{ min_units: 0, max_units: null, rate_per_unit: 7 }]} onBillGenerated={onBillGenerated} />);

    expect(screen.getAllByText("Rahul Sharma").length).toBeGreaterThan(0);
    expect(screen.getByText("200 units")).toBeInTheDocument();
    expect(screen.getByText("₹1,400.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Invoice" }));

    await waitFor(() => expect(onBillGenerated).toHaveBeenCalledOnce());
    expect(vi.mocked(generateSubmitterBill)).toHaveBeenCalledWith(expect.objectContaining({
      submitter_id: 4,
      previous_reading: 1000,
      current_reading: 1200,
      rate_mode: "manual",
      rate_per_unit: 7,
    }));
    expect(screen.getByText(emailStatus === "scheduled" ? "Invoice created; email notification scheduled." : "Email notification unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/email sent successfully/i)).not.toBeInTheDocument();
    expect(screen.getByText(/INV-2026-0001 is now available/)).toBeInTheDocument();
  });

  it("blocks negative units before invoice generation", () => {
    render(<PropertyBilling property={property} readings={[]} tariff={[{ min_units: 0, max_units: null, rate_per_unit: 7 }]} />);

    fireEvent.change(screen.getByLabelText("Previous reading"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Current reading"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Current reading cannot be lower than previous reading.");
    expect(screen.getByRole("button", { name: "Generate Invoice" })).toBeDisabled();
  });

  it("keeps edited readings when the same property data refreshes", () => {
    const { rerender } = render(<PropertyBilling property={property} readings={[reading]} tariff={[]} />);

    const previousInput = screen.getByLabelText("Previous reading") as HTMLInputElement;
    const currentInput = screen.getByLabelText("Current reading") as HTMLInputElement;
    fireEvent.change(previousInput, { target: { value: "1050" } });
    fireEvent.change(currentInput, { target: { value: "1200" } });

    rerender(<PropertyBilling property={{ ...property, name: "Room 101 (updated)" }} readings={[{ ...reading, current_reading: 1250 }]} tariff={[]} />);

    expect(previousInput).toHaveValue("1050");
    expect(currentInput).toHaveValue("1200");
    expect(screen.getAllByText("150 units")).toHaveLength(2);
  });

  it("initializes readings again when a different property is selected", () => {
    const otherProperty = { ...property, id: 2, name: "Room 102", unit: "102", submitters: [{ ...property.submitters[0], id: 5, property_id: 2, name: "Asha Rao" }] };
    const otherReading = { ...reading, id: 9, property_id: 2, property_name: "Room 102", submitter_id: 5, submitter_name: "Asha Rao", previous_reading: 2000, current_reading: 2200 };
    const { rerender } = render(<PropertyBilling property={property} readings={[reading]} tariff={[]} />);

    fireEvent.change(screen.getByLabelText("Previous reading"), { target: { value: "1050" } });
    fireEvent.change(screen.getByLabelText("Current reading"), { target: { value: "1200" } });
    rerender(<PropertyBilling property={otherProperty} readings={[reading, otherReading]} tariff={[]} />);

    expect(screen.getByLabelText("Previous reading")).toHaveValue("2000");
    expect(screen.getByLabelText("Current reading")).toHaveValue("2200");
    expect(screen.getAllByText("200 units")).toHaveLength(2);
  });

  it("uses the selected submitter's own latest reading", () => {
    const secondSubmitter = { id: 5, property_id: 1, name: "Asha Rao", user_id: 13, created_at: "", updated_at: "" };
    const secondReading = { ...reading, id: 9, submitter_id: 5, submitter_name: "Asha Rao", previous_reading: 200, current_reading: 260 };
    render(<PropertyBilling property={{ ...property, submitters: [...property.submitters, secondSubmitter] }} readings={[reading, secondReading]} tariff={[]} />);

    fireEvent.change(screen.getByLabelText("User / Submitter"), { target: { value: "5" } });

    expect(screen.getByLabelText("Previous reading")).toHaveValue("200");
    expect(screen.getByLabelText("Current reading")).toHaveValue("260");
  });

  it("keeps a manually edited rate and recalculates without resetting readings", () => {
    render(<PropertyBilling property={property} readings={[reading]} tariff={[{ min_units: 0, max_units: null, rate_per_unit: 7 }]} />);

    fireEvent.change(screen.getByLabelText("Rate per unit"), { target: { value: "8" } });

    expect(screen.getByLabelText("Previous reading")).toHaveValue("1000");
    expect(screen.getByLabelText("Current reading")).toHaveValue("1200");
    expect(screen.getByLabelText("Rate per unit")).toHaveValue("8");
    expect(screen.getByText("₹1,600.00")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Current reading"), { target: { value: "1250" } });

    expect(screen.getByLabelText("Current reading")).toHaveValue("1250");
    expect(screen.getByLabelText("Rate per unit")).toHaveValue("8");
    expect(screen.getByText("₹2,000.00")).toBeInTheDocument();
  });
});
