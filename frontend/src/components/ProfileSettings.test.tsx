import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSettings } from "@/components/ProfileSettings";
import { changePassword, updateCurrentUser } from "@/services/authApi";
import type { UserResponse } from "@/types/auth";


vi.mock("@/services/authApi", () => ({
  changePassword: vi.fn(),
  updateCurrentUser: vi.fn(),
}));


const account: UserResponse = {
  id: 2,
  name: "Regular User",
  email: "user@example.com",
  role: "user",
  is_active: true,
  must_change_password: false,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};


beforeEach(() => {
  vi.mocked(changePassword).mockReset();
  vi.mocked(updateCurrentUser).mockReset();
});


describe("ProfileSettings", () => {
  it("shows the role-based user avatar", () => {
    render(<ProfileSettings user={account} onUserUpdated={vi.fn()} />);
    expect(screen.getByLabelText("User avatar")).toBeInTheDocument();
  });

  it("persists name/email through the API and requires the password for email changes", async () => {
    const browser = userEvent.setup();
    const onUserUpdated = vi.fn();
    const updated = {
      ...account,
      name: "Persisted Name",
      email: "persisted@example.com",
    };
    vi.mocked(updateCurrentUser).mockResolvedValue(updated);
    render(<ProfileSettings user={account} onUserUpdated={onUserUpdated} />);

    await browser.clear(screen.getByLabelText("Name"));
    await browser.type(screen.getByLabelText("Name"), "  Persisted Name  ");
    await browser.clear(screen.getByLabelText("Email"));
    await browser.type(screen.getByLabelText("Email"), "persisted@example.com");
    await browser.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Enter your current password to change the email address.")).toBeInTheDocument();
    expect(updateCurrentUser).not.toHaveBeenCalled();

    await browser.type(
      screen.getByLabelText(/Current password.*required for email changes/),
      "CurrentPassword1!",
    );
    await browser.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(updateCurrentUser).toHaveBeenCalledWith({
      name: "Persisted Name",
      email: "persisted@example.com",
      current_password: "CurrentPassword1!",
    }));
    expect(onUserUpdated).toHaveBeenCalledWith(updated);
    expect(screen.getByText("Profile saved.")).toBeInTheDocument();
  });

  it("changes passwords through the API and publishes the refreshed user", async () => {
    const browser = userEvent.setup();
    const onUserUpdated = vi.fn();
    const updated = { ...account, updated_at: "2026-08-21T01:00:00Z" };
    vi.mocked(changePassword).mockResolvedValue(updated);
    render(<ProfileSettings user={account} onUserUpdated={onUserUpdated} />);

    await browser.type(screen.getByLabelText(/^Current password$/), "CurrentPassword1!");
    await browser.type(screen.getByLabelText("New password"), "PermanentPassword2!");
    await browser.type(screen.getByLabelText("Confirm new password"), "PermanentPassword2!");
    await browser.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({
      current_password: "CurrentPassword1!",
      new_password: "PermanentPassword2!",
    }));
    expect(onUserUpdated).toHaveBeenCalledWith(updated);
    expect(screen.getByText("Password changed. Other signed-in sessions were revoked.")).toBeInTheDocument();
  });
});
