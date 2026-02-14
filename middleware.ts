import { NextResponse, type NextRequest } from "next/server";
import { verifyCloudflareToken, isLocalBypassEnabled } from "@/lib/auth/cloudflare-core";
import { env } from "@/lib/config/env";

const PUBLIC_PATHS = ["/favicon.ico"];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/public") ||
    PUBLIC_PATHS.includes(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/cron/poll")) {
    const secret = request.headers.get("x-cron-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!secret || secret !== env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.next();
  }

  if (isLocalBypassEnabled) {
    return NextResponse.next();
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return NextResponse.json({ error: "Cloudflare Access token required" }, { status: 401 });
  }

  const identity = await verifyCloudflareToken(token);
  if (!identity) {
    return NextResponse.json({ error: "Invalid Cloudflare Access token" }, { status: 401 });
  }

  const response = NextResponse.next();
  response.headers.set("x-user-email", identity.email);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
