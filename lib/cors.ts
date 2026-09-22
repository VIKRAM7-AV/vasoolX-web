import { NextResponse } from "next/server";

export function getCorsHeaders(req?: Request): HeadersInit {
  const origin = req?.headers.get("origin");

  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, access_token, refresh_token, X-Requested-With",
  };
}

export function handleCorsOptions(req?: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}

export function apiResponse<T>(
  data: T,
  status = 200,
  req?: Request
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: getCorsHeaders(req),
  });
}
