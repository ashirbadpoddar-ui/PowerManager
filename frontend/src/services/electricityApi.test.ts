import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calculateSimpleBill } from "@/services/electricityApi";

describe("electricityApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://powermananager.onrender.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured API URL for simple calculations", async () => {
    const response = {
      main_meter: {
        previous_reading: 100,
        current_reading: 150,
        units: 50,
        rate_per_unit: 7,
        total_amount: 350,
      },
      submitters: [],
      submitter_total_units: 0,
      submitter_total_amount: 0,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(calculateSimpleBill({
      main_meter: { previous_reading: 100, current_reading: 150, rate_per_unit: 7 },
      submitters: [],
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://powermananager.onrender.com/api/electricity/simple-calculate",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});
