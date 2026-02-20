import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { sallaClient } from "@/lib/salla/client";
import { SALLA_OAUTH_STATE_COOKIE } from "@/lib/salla/oauth";

export const dynamic = "force-dynamic";

function redirectToSettings(request: NextRequest, status: "connected" | "error", message?: string) {
  const location = new URL("/settings", request.nextUrl.origin);
  location.searchParams.set("sallaOAuth", status);

  if (message) {
    location.searchParams.set("sallaMessage", message.slice(0, 200));
  }

  const response = NextResponse.redirect(location, { headers: NO_STORE_HEADERS });
  response.cookies.delete(SALLA_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const oauthErrorDescription = request.nextUrl.searchParams.get("error_description");
  const cookieState = request.cookies.get(SALLA_OAUTH_STATE_COOKIE)?.value ?? "";

  if (oauthError) {
    const message = oauthErrorDescription || `OAuth failed: ${oauthError}`;
    return redirectToSettings(request, "error", message);
  }

  if (!cookieState || !state || cookieState !== state) {
    return redirectToSettings(request, "error", "Invalid OAuth state. Please retry.");
  }

  if (!code) {
    return redirectToSettings(request, "error", "Missing OAuth code.");
  }

  try {
    const credential = await sallaClient.connectWithAuthorizationCode(code);
    const message = credential.merchantId
      ? `Connected successfully (merchant ${credential.merchantId}).`
      : "Connected successfully.";
    return redirectToSettings(request, "connected", message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback failed.";
    return redirectToSettings(request, "error", message);
  }
}
