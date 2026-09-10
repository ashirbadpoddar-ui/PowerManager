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
