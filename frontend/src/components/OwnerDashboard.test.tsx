import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerDashboard } from "@/components/OwnerDashboard";
import { calculateDetailedBill, generateDetailedBills } from "@/services/electricityApi";

vi.mock("@/services/electricityApi", () => ({
  calculateDetailedBill: vi.fn(),
  generateDetailedBills: vi.fn(),
}));

const calculation = {
  main_meter: { previous_reading: 0, current_reading: 250, units: 250, rate_per_unit: 10, total_amount: 2500 },
  submitters: [],
  submitter_total_units: 0,
  submitter_total_amount: 0,
};

const generated = {
  billing_run: { id: 42 },
  invoices: [],
};
const properties = { items: [{ id: 1, created_by_user_id: 1, name: "Room 1", place: "Pune", unit: "101", submitter_count: 1, submitters: [{ id: 2, property_id: 1, user_id: 3, name: "Linked User", created_at: "", updated_at: "" }], created_at: "", updated_at: "" }], total: 1, submitter_total: 1 };

describe("OwnerDashboard generated-bill success message", () => {
  beforeEach(() => {
    vi.mocked(calculateDetailedBill).mockResolvedValue(calculation as never);
    vi.mocked(generateDetailedBills).mockResolvedValue(generated as never);
  });

  it("dismisses the success message and opens Billing & Invoices through the supplied navigation callback", async () => {
    const browser = userEvent.setup();
    const onOpenBilling = vi.fn();
    render(<OwnerDashboard properties={properties} onOpenBilling={onOpenBilling} />);

    await browser.type(screen.getByLabelText("Previous reading"), "100");
    await browser.type(screen.getByLabelText("Current reading"), "250");
    await browser.type(screen.getAllByLabelText("Rate per unit")[0], "10");
    await browser.click(screen.getByRole("button", { name: "Add" }));
    await browser.type(screen.getByLabelText("Previous"), "0");
    await browser.type(screen.getByLabelText("Current"), "100");
    await browser.type(screen.getAllByLabelText("Rate per unit")[1], "5");
    await browser.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByRole("button", { name: "Generate invoices" });
    await browser.click(screen.getByRole("button", { name: "Generate invoices" }));
    await screen.findByText("Bill Generated Successfully");

    await browser.click(screen.getByRole("button", { name: "Open Billing & Invoices" }));
    await waitFor(() => expect(onOpenBilling).toHaveBeenCalledOnce());
    expect(screen.queryByText("Bill Generated Successfully")).not.toBeInTheDocument();
  });
});
