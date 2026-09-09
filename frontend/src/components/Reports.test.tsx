import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Reports from "@/components/Reports";
import type { PersistedMeterReading } from "@/types/electricity";

function reading(id: number, date: string, units: unknown): PersistedMeterReading {
  return {
    id,
    property_id: 1,
    property_name: "Main property",
    meter_name: "Main meter",
    previous_reading: 0,
    current_reading: 0,
    units_used: units as number,
    reading_date: date,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

describe("Reports billing overview", () => {
  it("keeps current and previous usage separate and formats numeric strings", () => {
    const view = render(<Reports bills={[]} readings={[reading(1, "2026-08-31", "085.000000"), reading(2, "2026-07-31", "300.000000")]} />);

    expect(screen.getByTitle("85 kWh")).toBeInTheDocument();
    expect(screen.getByTitle("300 kWh")).toBeInTheDocument();
    expect(screen.getByText("71.67% vs previous period")).toBeInTheDocument();
    expect(view.container.querySelector(".lucide-arrow-down")).toBeInTheDocument();
    expect(view.container.textContent).not.toContain("085.000000300.000000");
  });

  it("shows an em dash for invalid usage data", () => {
    render(<Reports bills={[]} readings={[reading(1, "2026-08-31", "not-a-number")]} />);

    expect(screen.getByTitle("—")).toBeInTheDocument();
    expect(screen.getByText("No prior period comparison")).toBeInTheDocument();
  });

  it("shows an em dash for missing usage data", () => {
    render(<Reports bills={[]} readings={[reading(1, "2026-08-31", null)]} />);

    expect(screen.getByTitle("—")).toBeInTheDocument();
  });
});
