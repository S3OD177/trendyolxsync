import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { sallaClient } from "@/lib/salla/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Salla OAuth via DB storage is disabled. Configure SALLA_ACCESS_TOKEN in environment variables."
    },
    { status: 501, headers: NO_STORE_HEADERS }
  );
}
