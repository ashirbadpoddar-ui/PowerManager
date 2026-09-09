import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DashboardOverview from "@/components/DashboardOverview";
import { dashboardData } from "@/lib/dashboardData";
import type { PersistedMeterReading } from "@/types/electricity";

const readings: PersistedMeterReading[] = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  property_id: 1,
  property_name: `Property ${index + 1}`,
  meter_name: `Meter ${index + 1}`,
  previous_reading: 100,
  current_reading: 120 + index,
  units_used: 20 + index,
  reading_date: `2026-08-0${index + 1}`,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
}));

describe("DashboardOverview recent meter readings", () => {
  it("renders persisted readings instead of mock readings", () => {
    render(<DashboardOverview data={dashboardData} recentMeterReadings={readings} topProperties={[{ name: "Property 1", units: 20, color: "var(--primary)" }]} electricityUsage={[{ day: "Fri", date: "01 Aug 2026", usage: 20 }]} onAction={vi.fn()} onInvoice={vi.fn()} />);

    expect(screen.getByText("Meter 1")).toBeInTheDocument();
    expect(screen.getByText(/Property 4/)).toBeInTheDocument();
    expect(screen.queryByText("Main Meter")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no persisted readings", () => {
    render(<DashboardOverview data={dashboardData} recentMeterReadings={[]} topProperties={[]} electricityUsage={[]} onAction={vi.fn()} onInvoice={vi.fn()} />);

    expect(screen.getByText("No meter readings recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No property usage recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No meter reading usage recorded yet.")).toBeInTheDocument();
  });

  it("renders the demo payment summary metrics", () => {
    render(<DashboardOverview data={{ ...dashboardData, paymentSummary: { totalCollected: 2400, pendingAmount: 600, paidBills: 3, pendingPayments: 1 } }} recentMeterReadings={[]} topProperties={[]} electricityUsage={[]} onAction={vi.fn()} onInvoice={vi.fn()} />);

    expect(screen.getByText("Total Collected")).toBeInTheDocument();
    expect(screen.getByText("Pending Amount")).toBeInTheDocument();
    expect(screen.getByText("Paid Bills")).toBeInTheDocument();
    expect(screen.getByText("Pending Payments")).toBeInTheDocument();
  });

  it("formats total units with Indian grouping and at most two decimals", () => {
    const { rerender } = render(<DashboardOverview data={dashboardData} recentMeterReadings={[]} topProperties={[]} electricityUsage={[{ day: "Fri", date: "01 Aug 2026", usage: 199.500000 }]} onAction={vi.fn()} onInvoice={vi.fn()} />);

    expect(screen.getByTitle("199.5")).toHaveTextContent("199.5");

    rerender(<DashboardOverview data={dashboardData} recentMeterReadings={[]} topProperties={[]} electricityUsage={[{ day: "Fri", date: "01 Aug 2026", usage: 1254300.75 }]} onAction={vi.fn()} onInvoice={vi.fn()} />);

    expect(screen.getByTitle("12,54,300.75")).toHaveTextContent("12,54,300.75");
  });

  it("shows period summaries, short date labels, and working range options", async () => {
    const browser = userEvent.setup();
    const points = Array.from({ length: 14 }, (_, index) => ({
      day: "Day",
      date: `${String(19 + index).padStart(2, "0")} Jul 2026`,
      usage: 10 + index,
    }));
    points.splice(12, 2, { day: "Day", date: "31 Jul 2026", usage: 22 }, { day: "Day", date: "01 Aug 2026", usage: 23 });

    render(<DashboardOverview data={dashboardData} recentMeterReadings={[]} topProperties={[]} electricityUsage={points} onAction={vi.fn()} onInvoice={vi.fn()} />);

    expect(screen.getByText("Current usage")).toBeInTheDocument();
    expect(screen.getByText("Previous period usage")).toBeInTheDocument();
    expect(screen.getByText("Percentage change")).toBeInTheDocument();
    expect(screen.getByTitle("140 kWh")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("23 kWh");

    await browser.click(screen.getByRole("button", { name: "Usage chart options" }));
    await browser.click(screen.getByRole("menuitemradio", { name: "Last 30 days" }));

    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("19 Jul")).toBeInTheDocument();
    expect(screen.queryByText("Day")).not.toBeInTheDocument();
  });
});
