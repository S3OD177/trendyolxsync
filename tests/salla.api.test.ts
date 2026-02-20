import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as oauthStartGET } from "@/app/api/integrations/salla/oauth/start/route";
import { GET as oauthCallbackGET } from "@/app/api/integrations/salla/oauth/callback/route";
import { POST as matchPOST } from "@/app/api/integrations/salla/match/route";
import { POST as syncPOST } from "@/app/api/integrations/salla/sync/route";
import { GET as statusGET } from "@/app/api/integrations/salla/status/route";
import { sallaClient } from "@/lib/salla/client";
import { matchPreview, runSallaBatchSync, runSingleSallaMatch } from "@/lib/salla/sync";

vi.mock("@/lib/salla/client", () => ({
  sallaClient: {
    isConfigured: vi.fn(),
    hasCredential: vi.fn(),
    getCredentialSummary: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    exchangeCodeForAccessToken: vi.fn(),
    upsertCredentialFromOAuthPayload: vi.fn()
  }
}));

vi.mock("@/lib/salla/sync", () => ({
  runSingleSallaMatch: vi.fn(),
  runSallaBatchSync: vi.fn(),
  matchPreview: vi.fn()
}));

describe("salla api routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sallaClient.isConfigured).mockReturnValue(true);
    vi.mocked(sallaClient.hasCredential).mockResolvedValue(true);
  });

  it("starts OAuth flow and sets state cookie", async () => {
    vi.mocked(sallaClient.buildAuthorizationUrl).mockReturnValue(
      "https://accounts.salla.sa/oauth2/auth?client_id=test"
    );

    const response = await oauthStartGET(
      new NextRequest("http://localhost:3000/api/integrations/salla/oauth/start")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("accounts.salla.sa/oauth2/auth");
    expect(response.headers.get("set-cookie")).toContain("salla_oauth_state=");
    expect(sallaClient.buildAuthorizationUrl).toHaveBeenCalledTimes(1);
  });

  it("handles OAuth callback success", async () => {
    vi.mocked(sallaClient.exchangeCodeForAccessToken).mockResolvedValue({
      access_token: "token-1",
      refresh_token: "refresh-1",
      expires_in: 3600
    });
    vi.mocked(sallaClient.upsertCredentialFromOAuthPayload).mockResolvedValue({} as any);

    const request = new NextRequest(
      "http://localhost:3000/api/integrations/salla/oauth/callback?code=abc&state=state123",
      {
        headers: {
          cookie: "salla_oauth_state=state123"
        }
      }
    );

    const response = await oauthCallbackGET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/settings?salla=connected");
    expect(sallaClient.exchangeCodeForAccessToken).toHaveBeenCalledWith("abc");
    expect(sallaClient.upsertCredentialFromOAuthPayload).toHaveBeenCalledTimes(1);
  });

  it("validates match request payload", async () => {
    const request = new NextRequest("http://localhost:3000/api/integrations/salla/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await matchPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBeDefined();
  });

  it("returns match response shape", async () => {
    vi.mocked(runSingleSallaMatch).mockResolvedValue({
      persisted: false,
      costWithoutTax: 77,
      match: {
        matched: true,
        method: "SKU",
        score: 1,
        reason: "MATCHED",
        product: {
          id: "s1",
          sku: "SKU-1",
          name: "Product 1",
          quantity: 5,
          preTaxPrice: 77,
          costPrice: 70,
          raw: {}
        },
        candidates: []
      }
    });
    vi.mocked(matchPreview).mockReturnValue({
      matched: true,
      reason: "MATCHED",
      method: "SKU",
      score: 1,
      product: { id: "s1", sku: "SKU-1", name: "Product 1", quantity: 5, preTaxPrice: 77, costPrice: 70 },
      candidates: []
    });

    const request = new NextRequest("http://localhost:3000/api/integrations/salla/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", persist: false })
    });

    const response = await matchPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.matched).toBe(true);
    expect(payload.costWithoutTax).toBe(77);
  });

  it("returns sync summary", async () => {
    vi.mocked(runSallaBatchSync).mockResolvedValue({
      ok: true,
      total: 2,
      processed: 2,
      matched: 1,
      updated: 1,
      skipped: 1,
      dryRun: false,
      persist: true,
      errors: []
    });

    const request = new NextRequest("http://localhost:3000/api/integrations/salla/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeOnly: true, limit: 20 })
    });

    const response = await syncPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.total).toBe(2);
  });

  it("returns connection status", async () => {
    vi.mocked(sallaClient.getCredentialSummary).mockResolvedValue({
      key: "default",
      merchantId: "55",
      scope: "products.read",
      expiresAt: null,
      updatedAt: new Date("2026-02-20T00:00:00.000Z")
    });

    const response = await statusGET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.configured).toBe(true);
    expect(payload.connected).toBe(true);
    expect(payload.credential.key).toBe("default");
  });
});
