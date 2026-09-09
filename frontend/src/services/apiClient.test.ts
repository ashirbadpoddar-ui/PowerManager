import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_EXPIRED_EVENT, apiRequest } from "@/services/apiClient";


function mockResponse({
  ok = true,
  status = 200,
  statusText = "OK",
  body = {},
}: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
} = {}): Response {
  return {
    ok,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}


afterEach(() => {
  vi.unstubAllGlobals();
});


describe("apiRequest", () => {
  it("always sends credentials and copies the readable CSRF cookie to mutations", async () => {
    document.cookie = "powermanage_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: { saved: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest<{ saved: boolean }>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
    ).resolves.toEqual({ saved: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("/api/auth/me");
    expect(init.credentials).toBe("include");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token-123");
  });

  it("does not attach a CSRF header to safe requests", async () => {
    document.cookie = "powermanage_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/users");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has("X-CSRF-Token")).toBe(false);
    expect(init.credentials).toBe("include");
  });

  it("uses an explicitly configured public API URL when one is provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/");
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/auth/me");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.test/api/auth/me");
  });

  it("explains how to restore the local proxy when a request cannot connect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiRequest("/api/properties")).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("http://127.0.0.1:8000"),
    });
  });

  it("emits the global session-expiry event for authenticated 401 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        body: { detail: "Authentication required" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);

    await expect(apiRequest("/api/auth/me")).rejects.toMatchObject({
      status: 401,
      message: "Authentication required",
    });
    expect(listener).toHaveBeenCalledOnce();

    window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
  });

  it("formats FastAPI validation details into a readable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          body: {
            detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }],
          },
        }),
      ),
    );

    await expect(apiRequest("/api/auth/login", { method: "POST" })).rejects.toMatchObject({
      status: 422,
      message: "email: value is not a valid email address",
    });
  });
});
