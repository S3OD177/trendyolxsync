import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import { PIN_COOKIE_NAME } from "@/lib/auth/pin";

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
    const secret =
      request.headers.get("x-cron-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!secret || secret !== env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/api/auth/pin")) {
    return NextResponse.next();
  }

  const hasPinSession = request.cookies.get(PIN_COOKIE_NAME)?.value === "1";

  if (!hasPinSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
