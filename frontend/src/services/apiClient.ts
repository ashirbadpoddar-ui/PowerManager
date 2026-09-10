import { getApiBaseUrl } from "@/lib/apiConfig";

export const AUTH_EXPIRED_EVENT = "powermanage:auth-expired";
let sessionCsrfToken: string | null = null;

type ApiRequestOptions = {
  notifyOnUnauthorized?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function formatValidationDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { msg?: unknown; loc?: unknown };
        if (typeof record.msg !== "string") return null;
        const location = Array.isArray(record.loc) ? record.loc.filter((part) => part !== "body").join(".") : "";
        return location ? `${location}: ${record.msg}` : record.msg;
      })
      .filter((value): value is string => Boolean(value));

    return messages.length ? messages.join(" ") : null;
  }

  return null;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = sessionCsrfToken ?? getCookie("powermanage_csrf");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const apiBaseUrl = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      method,
      headers,
      credentials: "include",
    });
  } catch (cause) {
    console.error("PowerManage connection request failed", { method, path, cause });
    throw new ApiError(
      "Unable to reach the server. Please try again.",
      0,
    );
  }

  if (!response.ok) {
    let details: unknown;
    try {
      const body = await response.json();
      details = body?.detail ?? body;
    } catch {
      details = undefined;
    }

    console.error("PowerManage API request failed", { method, path, status: response.status, details });
    const message = response.status >= 500
      ? "Request failed. Please try again."
      : response.status === 403
      ? "You do not have permission to perform this action."
      : formatValidationDetail(details) || response.statusText || "Request failed";
    if (response.status === 401 && options.notifyOnUnauthorized !== false && typeof window !== "undefined") {
      sessionCsrfToken = null;
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(message, response.status, details);
  }

  const csrfToken = response.headers?.get("X-CSRF-Token");
  if (csrfToken) sessionCsrfToken = csrfToken;
  if (path === "/api/auth/logout") sessionCsrfToken = null;
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
