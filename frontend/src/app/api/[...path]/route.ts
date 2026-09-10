import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/apiConfig";

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "content-encoding",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const header of Array.from(hopByHopHeaders)) headers.delete(header);
  // Do not forward unrelated cookies owned by the frontend host.
  const cookies = (request.headers.get("cookie") ?? "").split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => /^(powermanage_session|powermanage_csrf)=/.test(cookie));
  headers.delete("cookie");
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  headers.set("accept-encoding", "identity");
  return headers;
}

function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie" && !hopByHopHeaders.has(key)) headers.set(key, value);
  });

  const setCookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  headers.set("Cache-Control", "no-store");
  return headers;
}

async function proxy(request: Request, { params }: RouteContext): Promise<Response> {
  let backendUrl: string;
  try {
    backendUrl = getApiBaseUrl();
  } catch {
    return NextResponse.json(
      { detail: "PowerManage API configuration is unavailable." },
      { status: 500 },
    );
  }

  const { path } = await params;
  const incomingUrl = new URL(request.url);
  if (new URL(backendUrl).origin === incomingUrl.origin) {
    return NextResponse.json({ detail: "API upstream must not point to the frontend." }, { status: 500 });
  }
  const origin = request.headers.get("origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && origin !== incomingUrl.origin) {
    return NextResponse.json({ detail: "Untrusted request origin." }, { status: 403 });
  }
  const targetUrl = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, `${backendUrl}/`);
  targetUrl.search = incomingUrl.search;
  const isBodylessMethod = request.method === "GET" || request.method === "HEAD";

  try {
    const backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers: copyRequestHeaders(request),
      body: isBodylessMethod ? undefined : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
    });
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: copyResponseHeaders(backendResponse),
    });
  } catch {
    return NextResponse.json(
      {
        detail: "PowerManage backend is unavailable. Please try again shortly.",
      },
      { status: 503 },
    );
  }
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
