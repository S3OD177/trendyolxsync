import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { sallaClient } from "@/lib/salla/client";
import {
  createSallaOAuthState,
  SALLA_OAUTH_STATE_COOKIE,
  SALLA_OAUTH_STATE_MAX_AGE_SECONDS
} from "@/lib/salla/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!sallaClient.isOAuthReady()) {
    return NextResponse.json(
      {
        error:
          "Salla OAuth is not configured. Set SALLA_CLIENT_ID, SALLA_CLIENT_SECRET, and SALLA_REDIRECT_URI."
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const state = createSallaOAuthState();
  const authorizationUrl = sallaClient.getAuthorizationUrl(state);
  const response = NextResponse.redirect(authorizationUrl, { headers: NO_STORE_HEADERS });

  response.cookies.set({
    name: SALLA_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SALLA_OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/"
  });

  return response;
}
