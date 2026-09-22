import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for all API routes, static files, and images
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;

  // Protected routes: /admin and any nested routes
  if (pathname.startsWith("/admin")) {
    if (!accessToken) {
      const loginUrl = new URL("/", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Public/Auth routes: / (login page)
  if (pathname === "/") {
    if (accessToken) {
      const adminUrl = new URL("/admin", request.url);
      return NextResponse.redirect(adminUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
