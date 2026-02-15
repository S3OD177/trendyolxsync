import { NextRequest, NextResponse } from "next/server";
import { trendyolClient } from "@/lib/trendyol/client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!trendyolClient.isConfigured()) {
    return NextResponse.json({ error: "Trendyol not configured" }, { status: 500 });
  }

  const { path, method, body } = await request.json();

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "Missing 'path'" }, { status: 400 });
  }

  const start = Date.now();

  try {
    const init: RequestInit = { method: method ?? "GET" };
    if (body) {
      init.body = JSON.stringify(body);
    }

    const result = await trendyolClient.testEndpoint(path, init);

    return NextResponse.json({
      status: "ok",
      httpStatus: result.status,
      durationMs: Date.now() - start,
      response: result.body
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
