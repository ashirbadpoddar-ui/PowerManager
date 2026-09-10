const LOCAL_API_URL = "http://127.0.0.1:8000";

function configuredApiUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

/**
 * Returns the sole API origin used by browser clients and the local proxy.
 * A deployed application must explicitly provide NEXT_PUBLIC_API_URL.
 */
export function getApiBaseUrl(): string {
  const apiUrl = configuredApiUrl();
  if (apiUrl) return apiUrl;

  if (process.env.NODE_ENV === "development") return LOCAL_API_URL;

  throw new Error("NEXT_PUBLIC_API_URL is not configured");
}
