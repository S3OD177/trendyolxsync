import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { SALLA_OAUTH_STATE_COOKIE, SALLA_OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/salla/oauth";
import { sallaClient } from "@/lib/salla/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!sallaClient.isConfigured()) {
    return NextResponse.json(
      { error: "Salla OAuth is not configured" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const state = crypto.randomUUID();
  const url = sallaClient.buildAuthorizationUrl(state);
  const response = NextResponse.redirect(new URL(url, request.url), {
    headers: NO_STORE_HEADERS
  });

  response.cookies.set(SALLA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SALLA_OAUTH_STATE_MAX_AGE_SECONDS
  });

  return response;
}
