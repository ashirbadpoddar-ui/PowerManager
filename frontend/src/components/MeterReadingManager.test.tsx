import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MeterReadingManager } from "@/components/MeterReadingManager";

const listMeterReadings = vi.fn();
const createMeterReading = vi.fn();

vi.mock("@/services/meterReadingApi", () => ({
  listMeterReadings: (...args: unknown[]) => listMeterReadings(...args),
  createMeterReading: (...args: unknown[]) => createMeterReading(...args),
  updateMeterReading: vi.fn(),
  deleteMeterReading: vi.fn(),
}));

const properties = {
  items: [{ id: 1, created_by_user_id: 1, name: "Sunshine Apartments", place: "Pune", unit: "A-101", submitters: [], submitter_count: 0, created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z" }],
  total: 1,
  submitter_total: 0,
};

describe("MeterReadingManager", () => {
  it("loads readings, saves a new reading, and notifies the dashboard", async () => {
    listMeterReadings.mockResolvedValueOnce({ items: [], total: 0 });
    createMeterReading.mockResolvedValueOnce({ id: 1, property_id: 1, property_name: "Sunshine Apartments", meter_name: "Main Meter", previous_reading: 100, current_reading: 120, units_used: 20, reading_date: "2026-08-31", created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z" });
    const onChanged = vi.fn();
    render(<MeterReadingManager properties={properties} onChanged={onChanged} />);

    await screen.findByText("No readings yet");
    fireEvent.click(screen.getByRole("button", { name: "Add reading" }));
    fireEvent.change(screen.getByLabelText("Previous reading"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Current reading"), { target: { value: "120" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add reading" })[1]);

    await waitFor(() => expect(createMeterReading).toHaveBeenCalledWith(expect.objectContaining({ property_id: 1, meter_name: "Main Meter", previous_reading: 100, current_reading: 120 })));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(await screen.findByText("Sunshine Apartments")).toBeInTheDocument();
  });
});
