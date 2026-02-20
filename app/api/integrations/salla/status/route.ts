import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { sallaClient } from "@/lib/salla/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configured = sallaClient.isConfigured();
    const credential = configured ? await sallaClient.getCredentialSummary() : null;

    return NextResponse.json(
      {
        configured,
        connected: Boolean(credential),
        costSource: env.SALLA_COST_SOURCE,
        credential
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        configured: sallaClient.isConfigured(),
        connected: false,
        error: error instanceof Error ? error.message : "Failed to read Salla status"
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
