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
  if (apiUrl) {
    const url = new URL(apiUrl);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error("NEXT_PUBLIC_API_URL must be an HTTP(S) origin without a path or credentials");
    }
    if (process.env.NODE_ENV === "production" && (
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.startsWith("127.") || hostname === "[::1]" || hostname === "0.0.0.0"
    )) {
      throw new Error("NEXT_PUBLIC_API_URL must not use localhost or a loopback address in production");
    }
    return url.origin;
  }

  if (process.env.NODE_ENV === "development") return LOCAL_API_URL;

  throw new Error("NEXT_PUBLIC_API_URL is not configured");
}
