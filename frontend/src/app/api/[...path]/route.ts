import { NextResponse } from "next/server";

const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const hopByHopHeaders = new Set([
  "connection",
  "content-length",
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
  return headers;
}

async function proxy(request: Request, { params }: RouteContext): Promise<Response> {
  const { path } = await params;
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`/${path.map(encodeURIComponent).join("/")}`, `${backendUrl}/`);
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
