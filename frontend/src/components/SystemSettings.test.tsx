import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SystemSettings } from "@/components/SystemSettings";

describe("SystemSettings", () => {
  it("changes the selected theme", async () => {
    const browser = userEvent.setup();
    const onThemeChange = vi.fn();
    render(<SystemSettings theme="dark" onThemeChange={onThemeChange} isAdministrator={false} />);

    await browser.click(screen.getByRole("button", { name: /light theme/i }));
    expect(onThemeChange).toHaveBeenCalledWith("light");
    expect(screen.queryByText("Reset all workspace data")).not.toBeInTheDocument();
  });

  it("requires RESET before an administrator can clear the workspace", async () => {
    const browser = userEvent.setup();
    const reset = vi.fn().mockResolvedValue({ properties_cleared: 1, submitters_cleared: 1, meter_readings_cleared: 1, bills_cleared: 1, billing_runs_cleared: 0, tariff_defaults_restored: true });
    render(<SystemSettings theme="dark" onThemeChange={vi.fn()} onResetWorkspace={reset} isAdministrator />);

    await browser.click(screen.getByRole("button", { name: "Reset workspace data" }));
    const confirm = screen.getByLabelText("Type RESET to confirm");
    expect(screen.getByRole("button", { name: "Permanently reset data" })).toBeDisabled();
    await browser.type(confirm, "RESET");
    await browser.click(screen.getByRole("button", { name: "Permanently reset data" }));

    await waitFor(() => expect(reset).toHaveBeenCalledOnce());
    expect(screen.getByText(/Workspace reset: 1 properties/)).toBeInTheDocument();
  });
});
