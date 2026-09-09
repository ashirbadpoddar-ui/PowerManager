import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserManagement } from "@/components/UserManagement";
import { createUser, listUsers, resetUserPassword, updateUser } from "@/services/authApi";
import type { UserResponse } from "@/types/auth";


vi.mock("@/services/authApi", () => ({
  createUser: vi.fn(),
  listUsers: vi.fn(),
  resetUserPassword: vi.fn(),
  updateUser: vi.fn(),
}));


const administrator: UserResponse = {
  id: 1,
  name: "Alice Admin",
  email: "alice@example.com",
  role: "administrator",
  is_active: true,
  must_change_password: false,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

const regularUser: UserResponse = {
  ...administrator,
  id: 2,
  name: "Regular User",
  email: "user@example.com",
  role: "user",
  must_change_password: true,
};


beforeEach(() => {
  vi.mocked(createUser).mockReset();
  vi.mocked(listUsers).mockReset();
  vi.mocked(resetUserPassword).mockReset();
  vi.mocked(updateUser).mockReset();
  vi.mocked(listUsers).mockResolvedValue([administrator, regularUser]);
});


describe("UserManagement", () => {
  it("lists accounts and creates one with an administrator-chosen temporary password", async () => {
    const browser = userEvent.setup();
    const created: UserResponse = {
      ...regularUser,
      id: 3,
      name: "New Operator",
      email: "operator@example.com",
    };
    vi.mocked(createUser).mockResolvedValue(created);
    render(
      <UserManagement currentUser={administrator} onCurrentUserUpdated={vi.fn()} />,
    );

    expect(await screen.findByText("Regular User")).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Create user" }));
    await browser.type(screen.getByLabelText("Name"), "New Operator");
    await browser.type(screen.getByLabelText("Email"), "operator@example.com");
    await browser.type(screen.getByLabelText("Temporary password"), "TemporaryPassword3!");
    await browser.type(screen.getByLabelText("Confirm temporary password"), "TemporaryPassword3!");
    await browser.click(
      within(screen.getByRole("dialog", { name: "Create user" })).getByRole(
        "button",
        { name: "Create user" },
      ),
    );

    await waitFor(() => expect(createUser).toHaveBeenCalledWith({
      name: "New Operator",
      email: "operator@example.com",
      role: "user",
      password: "TemporaryPassword3!",
    }));
    expect(await screen.findByText("New Operator")).toBeInTheDocument();
  });

  it("edits account role/status and resets a temporary password", async () => {
    const browser = userEvent.setup();
    const promoted = { ...regularUser, role: "administrator" as const, is_active: false };
    vi.mocked(updateUser).mockResolvedValue(promoted);
    vi.mocked(resetUserPassword).mockResolvedValue(undefined);
    render(
      <UserManagement currentUser={administrator} onCurrentUserUpdated={vi.fn()} />,
    );
    expect(await screen.findByText("Regular User")).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: "Edit Regular User" }));
    await browser.selectOptions(screen.getByLabelText("Role"), "administrator");
    await browser.selectOptions(screen.getByLabelText("Status"), "inactive");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(2, {
      name: "Regular User",
      email: "user@example.com",
      role: "administrator",
      is_active: false,
    }));

    await browser.click(screen.getByRole("button", { name: "Reset Regular User's password" }));
    await browser.type(screen.getByLabelText("New temporary password"), "ResetTemporaryPass4!");
    await browser.type(screen.getByLabelText("Confirm password"), "ResetTemporaryPass4!");
    await browser.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith(2, "ResetTemporaryPass4!"));
    expect(screen.getByText("Temporary password set. The user must change it at next sign-in.")).toBeInTheDocument();
  });
});
