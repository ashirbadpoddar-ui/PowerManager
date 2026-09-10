import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGate } from "@/components/AuthGate";
import { AUTH_EXPIRED_EVENT, ApiError } from "@/services/apiClient";
import {
  bootstrapAdministrator,
  changePassword,
  getBootstrapStatus,
  getCurrentUser,
  login,
  logout,
} from "@/services/authApi";
import type { UserResponse } from "@/types/auth";


vi.mock("@/services/authApi", () => ({
  bootstrapAdministrator: vi.fn(),
  changePassword: vi.fn(),
  getBootstrapStatus: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));


const admin: UserResponse = {
  id: 1,
  name: "Alice Admin",
  email: "alice@example.com",
  role: "administrator",
  is_active: true,
  must_change_password: false,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};


function authenticatedChild() {
  return (
    <AuthGate>
      {({ user, signOut }) => (
        <div>
          <p>Authenticated as {user.name}</p>
          <button onClick={() => void signOut()}>Test logout</button>
        </div>
      )}
    </AuthGate>
  );
}


beforeEach(() => {
  vi.mocked(bootstrapAdministrator).mockReset();
  vi.mocked(changePassword).mockReset();
  vi.mocked(getBootstrapStatus).mockReset();
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(login).mockReset();
  vi.mocked(logout).mockReset();
});


describe("AuthGate", () => {
  it("keeps the session visible when logout cannot reach the server", async () => {
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: false });
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(logout).mockRejectedValue(new ApiError("Network failure", 0));
    render(authenticatedChild());
    await screen.findByText("Authenticated as Alice Admin");
    fireEvent.click(screen.getByRole("button", { name: "Test logout" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach the server");
    expect(screen.getByText("Authenticated as Alice Admin")).toBeInTheDocument();
  });
  it("keeps startup visible on connection failure and retries into setup", async () => {
    vi.mocked(getBootstrapStatus).mockRejectedValueOnce(new ApiError("connection refused", 0));
    render(authenticatedChild());
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach the server. Please try again.");
    expect(screen.getByRole("heading", { name: "Welcome to PowerManage" })).toBeInTheDocument();
    expect(screen.queryByText("PowerManage is unavailable")).not.toBeInTheDocument();
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: true });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Create the first administrator" })).toBeInTheDocument();
  });

  it("keeps login inputs when the login request fails", async () => {
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: false });
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError("Unauthorized", 401));
    vi.mocked(login).mockRejectedValue(new ApiError("Unable to reach the server. Please try again.", 0));
    render(authenticatedChild());
    await screen.findByRole("heading", { name: "Welcome back" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach the server");
    expect(screen.getByLabelText("Email")).toHaveValue("alice@example.com");
  });
  it("prefills and removes the legacy profile name during first-admin bootstrap", async () => {
    const browser = userEvent.setup();
    window.localStorage.setItem("powermanage-profile-name", "Legacy Administrator");
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: true });
    vi.mocked(bootstrapAdministrator).mockResolvedValue({
      ...admin,
      name: "Legacy Administrator",
    });

    render(authenticatedChild());

    expect(await screen.findByRole("heading", { name: "Create the first administrator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Legacy Administrator");
    await browser.type(screen.getByLabelText("Email"), "admin@example.com");
    await browser.type(screen.getByLabelText("Bootstrap token"), "one-time-token");
    await browser.type(screen.getByLabelText("Password"), "BootstrapPass1!");
    await browser.type(screen.getByLabelText("Confirm password"), "BootstrapPass1!");
    await browser.click(screen.getByRole("button", { name: "Create administrator" }));

    await waitFor(() => expect(bootstrapAdministrator).toHaveBeenCalledWith({
      setup_token: "one-time-token",
      name: "Legacy Administrator",
      email: "admin@example.com",
      password: "BootstrapPass1!",
    }));
    expect(await screen.findByText("Authenticated as Legacy Administrator")).toBeInTheDocument();
    expect(window.localStorage.getItem("powermanage-profile-name")).toBeNull();
  });

  it("falls back to login, clears anonymous legacy data, and logs out", async () => {
    const browser = userEvent.setup();
    window.localStorage.setItem("powermanage-profile-name", "Do not import me");
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: false });
    vi.mocked(getCurrentUser).mockRejectedValue(
      new ApiError("Authentication required", 401),
    );
    vi.mocked(login).mockResolvedValue(admin);
    vi.mocked(logout).mockResolvedValue(undefined);

    render(authenticatedChild());

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    await browser.type(screen.getByLabelText("Email"), "alice@example.com");
    await browser.type(screen.getByLabelText("Password"), "CorrectHorseBattery1!");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Authenticated as Alice Admin")).toBeInTheDocument();
    expect(window.localStorage.getItem("powermanage-profile-name")).toBeNull();

    await browser.click(screen.getByRole("button", { name: "Test logout" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("You have signed out.")).toBeInTheDocument();
  });

  it("requires a temporary-password replacement before rendering the app", async () => {
    const browser = userEvent.setup();
    const forcedUser = { ...admin, role: "user" as const, must_change_password: true };
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: false });
    vi.mocked(getCurrentUser).mockResolvedValue(forcedUser);
    vi.mocked(changePassword).mockResolvedValue({
      ...forcedUser,
      must_change_password: false,
    });

    render(authenticatedChild());

    expect(await screen.findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    await browser.type(screen.getByLabelText("Temporary password"), "TemporaryPassword1!");
    await browser.type(screen.getByLabelText("New password"), "PermanentPassword2!");
    await browser.type(screen.getByLabelText("Confirm new password"), "PermanentPassword2!");
    await browser.click(screen.getByRole("button", { name: "Save new password" }));

    expect(changePassword).toHaveBeenCalledWith({
      current_password: "TemporaryPassword1!",
      new_password: "PermanentPassword2!",
    });
    expect(await screen.findByText("Authenticated as Alice Admin")).toBeInTheDocument();
  });

  it("returns to login when the shared API client reports session expiry", async () => {
    vi.mocked(getBootstrapStatus).mockResolvedValue({ setup_required: false });
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    render(authenticatedChild());
    expect(await screen.findByText("Authenticated as Alice Admin")).toBeInTheDocument();

    fireEvent(window, new CustomEvent(AUTH_EXPIRED_EVENT));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Your session has expired. Sign in again to continue.")).toBeInTheDocument();
  });
});
