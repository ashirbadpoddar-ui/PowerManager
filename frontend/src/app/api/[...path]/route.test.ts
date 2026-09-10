import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://powermananager.onrender.com");
  return import("./route");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API proxy", () => {
  it("preserves secure session cookies and forwards them on session restore", async () => {
    const upstreamHeaders = new Headers();
    upstreamHeaders.append("Set-Cookie", "powermanage_session=opaque; Path=/; Secure; HttpOnly; SameSite=None");
    upstreamHeaders.append("Set-Cookie", "powermanage_csrf=csrf; Path=/; Secure; SameSite=None");
    upstreamHeaders.set("X-CSRF-Token", "csrf");
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { headers: upstreamHeaders }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { POST, GET } = await loadRoute();
    const login = await POST(new Request("https://frontend.example/api/auth/login", {
      method: "POST", headers: { Origin: "https://frontend.example", "Content-Type": "application/json" }, body: "{}",
    }), { params: Promise.resolve({ path: ["auth", "login"] }) });
    expect(login.headers.getSetCookie()).toEqual(upstreamHeaders.getSetCookie());
    expect(login.headers.get("cache-control")).toBe("no-store");
    await GET(new Request("https://frontend.example/api/auth/me", {
      headers: { Cookie: "powermanage_session=opaque; powermanage_csrf=csrf; unrelated=private" },
    }), { params: Promise.resolve({ path: ["auth", "me"] }) });
    const headers = fetchMock.mock.calls[1][1].headers as Headers;
    expect(headers.get("cookie")).toBe("powermanage_session=opaque; powermanage_csrf=csrf");
    expect(fetchMock.mock.calls[1][0].href).toBe("https://powermananager.onrender.com/api/auth/me");
  });
  it("forwards the API path and query string to FastAPI", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ setup_required: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await loadRoute();

    const response = await GET(
      new Request("http://localhost:3000/api/auth/bootstrap-status?source=test"),
      { params: Promise.resolve({ path: ["auth", "bootstrap-status"] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://powermananager.onrender.com/api/auth/bootstrap-status?source=test"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ setup_required: false });
  });

  it("returns a clear 503 response when FastAPI cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));
    const { GET } = await loadRoute();

    const response = await GET(
      new Request("http://localhost:3000/api/properties"),
      { params: Promise.resolve({ path: ["properties"] }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: expect.stringContaining("PowerManage backend is unavailable"),
    });
  });
});
