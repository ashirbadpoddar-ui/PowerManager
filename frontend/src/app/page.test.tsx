import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Page, { getElectricityUsageOverview, getTopPropertyUsage, MobileSidebar } from "@/app/page";

const listMeterReadings = vi.fn().mockResolvedValue({ items: [], total: 0 });

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (session: unknown) => React.ReactNode }) => children({
    user: {
      id: 2,
      name: "Regular User",
      email: "user@example.com",
      role: "user",
      is_active: true,
      must_change_password: false,
      created_at: "2026-08-21T00:00:00Z",
      updated_at: "2026-08-21T00:00:00Z",
    },
    setUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/services/electricityApi", () => ({
  calculateElectricityBill: vi.fn(),
  calculateBill: vi.fn(),
  calculateDetailedBill: vi.fn(),
  getTariffSettings: vi.fn().mockRejectedValue(new Error("Administrator only")),
  resetWorkspaceData: vi.fn(),
  updateTariffSettings: vi.fn(),
}));

vi.mock("@/services/propertyApi", () => ({
  listProperties: vi.fn().mockResolvedValue({ items: [], total: 0, submitter_total: 0 }),
}));

vi.mock("@/services/meterReadingApi", () => ({
  listMeterReadings: (...args: unknown[]) => listMeterReadings(...args),
}));

vi.mock("@/services/portalApi", () => ({
  getMySubmitter: vi.fn().mockResolvedValue({ assigned: false, tariff: [], latest_reading: null }),
  listMyBills: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getMyConsumption: vi.fn().mockResolvedValue({ current_month_units: 0, previous_month_units: 0, absolute_change: 0, percentage_change: null, history: [] }),
  listMyMeterReadings: vi.fn().mockResolvedValue([]),
  submitMyMeterReading: vi.fn(),
  getMyBill: vi.fn(),
}));


describe("role-aware application navigation", () => {
  it("closes the mobile drawer with Escape and restores body scrolling", async () => {
    const browser = userEvent.setup();
    const onClose = vi.fn();
    const view = render(<MobileSidebar activeView="Dashboard" onNavigate={vi.fn()} onClose={onClose} />);

    expect(document.body.style.overflow).toBe("hidden");
    await browser.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("ranks all-time property usage from every saved reading", () => {
    const rankings = getTopPropertyUsage([
      { id: 1, property_id: 1, property_name: "Alpha", meter_name: "Main", previous_reading: 0, current_reading: 30, units_used: 30, reading_date: "2026-08-01", created_at: "", updated_at: "" },
      { id: 2, property_id: 2, property_name: "Beta", meter_name: "Main", previous_reading: 0, current_reading: 40, units_used: 40, reading_date: "2026-08-02", created_at: "", updated_at: "" },
      { id: 3, property_id: 1, property_name: "Alpha", meter_name: "Sub", previous_reading: 0, current_reading: 20, units_used: 20, reading_date: "2026-08-03", created_at: "", updated_at: "" },
      { id: 4, property_id: 3, property_name: "Gamma", meter_name: "Main", previous_reading: 0, current_reading: 10, units_used: 10, reading_date: "2026-08-04", created_at: "", updated_at: "" },
      { id: 5, property_id: 4, property_name: "Delta", meter_name: "Main", previous_reading: 0, current_reading: 9, units_used: 9, reading_date: "2026-08-05", created_at: "", updated_at: "" },
      { id: 6, property_id: 5, property_name: "Epsilon", meter_name: "Main", previous_reading: 0, current_reading: 8, units_used: 8, reading_date: "2026-08-06", created_at: "", updated_at: "" },
    ]);

    expect(rankings.map(({ name, units }) => ({ name, units }))).toEqual([
      { name: "Alpha", units: 50 }, { name: "Beta", units: 40 }, { name: "Gamma", units: 10 }, { name: "Delta", units: 9 }, { name: "Epsilon", units: 8 },
    ]);
  });

  it("aggregates usage by date in chronological order", () => {
    const usage = getElectricityUsageOverview([
      { id: 1, property_id: 1, property_name: "Alpha", meter_name: "Main", previous_reading: 0, current_reading: 8, units_used: 8, reading_date: "2026-08-03", created_at: "", updated_at: "" },
      { id: 2, property_id: 2, property_name: "Beta", meter_name: "Main", previous_reading: 0, current_reading: 12, units_used: 12, reading_date: "2026-08-01", created_at: "", updated_at: "" },
      { id: 3, property_id: 1, property_name: "Alpha", meter_name: "Sub", previous_reading: 0, current_reading: 7, units_used: 7, reading_date: "2026-08-03", created_at: "", updated_at: "" },
    ]);

    expect(usage.map(({ date, usage: value }) => ({ date, usage: value }))).toEqual([
      { date: "01 Aug 2026", usage: 12 },
      { date: "03 Aug 2026", usage: 15 },
    ]);
  });

  it("keeps administrator controls out of the submitter workspace", async () => {
    const browser = userEvent.setup();
    render(<Page />);

    expect(screen.queryByRole("button", { name: "Bill calculator" })).not.toBeInTheDocument();
    expect(screen.queryByText("Bill Calculator")).not.toBeInTheDocument();
    expect(screen.queryByText("Tariff Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Restart Workspace")).not.toBeInTheDocument();

    const accountButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Regular User"));
    expect(accountButton).toBeDefined();
    await browser.click(accountButton!);
    expect(screen.queryByText("Permissions & Roles")).not.toBeInTheDocument();
    expect(screen.queryByText("System Settings")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Submitters" })).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "My Meter" }));
    expect(screen.getByText("No meter has been assigned")).toBeInTheDocument();
  });

  it("keeps property management out of the submitter workspace", () => {
    render(<Page />);

    expect(screen.getByRole("button", { name: "My Meter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Bills" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consumption" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Properties" })).not.toBeInTheDocument();
  });

  it("shows the account-assignment empty state in the submitter workspace", async () => {
    const browser = userEvent.setup();
    render(<Page />);

    await browser.click(screen.getByRole("button", { name: "My Meter" }));
    expect(screen.getByText("No meter has been assigned")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate bills/i })).not.toBeInTheDocument();
  });

  it("does not poll the Admin meter endpoint from the submitter workspace", async () => {
    vi.useFakeTimers();
    listMeterReadings.mockClear();
    listMeterReadings.mockResolvedValue({ items: [], total: 0 });
    const view = render(<Page />);

    await act(async () => { await Promise.resolve(); });
    expect(listMeterReadings).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(15_000); await Promise.resolve(); });
    expect(listMeterReadings).not.toHaveBeenCalled();

    view.unmount();
    vi.useRealTimers();
  });
});
