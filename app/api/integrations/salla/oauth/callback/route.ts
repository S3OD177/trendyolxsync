import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { SALLA_OAUTH_STATE_COOKIE } from "@/lib/salla/oauth";
import { sallaClient } from "@/lib/salla/client";

export const dynamic = "force-dynamic";

function clearStateCookie(response: NextResponse) {
  response.cookies.set(SALLA_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function GET(request: NextRequest) {
  if (!sallaClient.isConfigured()) {
    return NextResponse.json(
      { error: "Salla OAuth is not configured" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get(SALLA_OAUTH_STATE_COOKIE)?.value;

  if (oauthError) {
    return NextResponse.json(
      { error: `Salla OAuth returned error: ${oauthError}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      { error: "Invalid Salla OAuth state" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing Salla authorization code" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const payload = await sallaClient.exchangeCodeForAccessToken(code);
    await sallaClient.upsertCredentialFromOAuthPayload(payload);

    const redirectUrl = new URL("/settings?salla=connected", request.url);
    const response = NextResponse.redirect(redirectUrl, { headers: NO_STORE_HEADERS });
    clearStateCookie(response);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? encodeURIComponent(error.message.slice(0, 120)) : "oauth_failed";
    const redirectUrl = new URL(`/settings?salla=error&reason=${message}`, request.url);
    const response = NextResponse.redirect(redirectUrl, { headers: NO_STORE_HEADERS });
    clearStateCookie(response);
    return response;
  }
}
