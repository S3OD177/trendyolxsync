"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EndpointDef {
  id: string;
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  pathTemplate: string;
  body?: Record<string, unknown>;
  category: string;
  target?: "trendyol" | "local";
}

interface TestResult {
  id: string;
  status: "pending" | "running" | "ok" | "error";
  httpStatus?: number;
  durationMs?: number;
  response?: unknown;
  error?: string;
}

const SELLER_ID = "{{sellerId}}"; // replaced at runtime
const LIVE_REFRESH_INTERVAL_MS = 45_000;

const ENDPOINTS: EndpointDef[] = [
  // ── Product (Read) ──────────────────────────────────────────
  {
    id: "products-approved",
    name: "Products (Approved)",
    description: "Fetch approved products — v2 endpoint with full product fields",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/approved?page=0&size=5&supplierId=${SELLER_ID}`,
    category: "Product"
  },
  {
    id: "products-unapproved",
    name: "Products (Unapproved)",
    description: "Fetch products pending approval",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/unapproved?page=0&size=5`,
    category: "Product"
  },
  {
    id: "products-base",
    name: "Products (Base / All)",
    description: "Fetch base product list (approved + unapproved)",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products?page=0&size=5&supplierId=${SELLER_ID}`,
    category: "Product"
  },
  {
    id: "buybox",
    name: "Buybox Information",
    description: "Get buybox/competitor data for barcodes (POST with barcodes array)",
    method: "POST",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/buybox-information`,
    body: { barcodes: ["{{barcode}}"], supplierId: "{{sellerIdNum}}" },
    category: "Product"
  },

  // ── Product (Write / Mutation) ──────────────────────────────
  {
    id: "price-inventory",
    name: "Price & Inventory Update",
    description: "Update product price and stock (POST, empty items = safe test)",
    method: "POST",
    pathTemplate: `/integration/inventory/sellers/${SELLER_ID}/products/price-and-inventory`,
    body: { items: [] },
    category: "Product Mutations"
  },
  {
    id: "product-create-v2",
    name: "Product Create (v2, dry run)",
    description: "Create product endpoint — empty items array for safe testing",
    method: "POST",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products`,
    body: { items: [] },
    category: "Product Mutations"
  },
  {
    id: "product-update-approved",
    name: "Update Approved Products (dry run)",
    description: "Update approved product fields — empty items for safe testing",
    method: "POST",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/approved`,
    body: { items: [] },
    category: "Product Mutations"
  },
  {
    id: "product-archive",
    name: "Archive Product (dry run)",
    description: "Archive products — empty items for safe testing",
    method: "POST",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/archive`,
    body: { items: [] },
    category: "Product Mutations"
  },
  {
    id: "product-delete",
    name: "Delete Product (dry run)",
    description: "Delete products — empty items for safe testing",
    method: "POST",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/delete`,
    body: { items: [] },
    category: "Product Mutations"
  },

  // ── Catalog ─────────────────────────────────────────────────
  {
    id: "categories",
    name: "Category Tree",
    description: "Full Trendyol category hierarchy",
    method: "GET",
    pathTemplate: `/integration/product/product-categories`,
    category: "Catalog"
  },
  {
    id: "category-attributes",
    name: "Category Attributes",
    description: "Get attributes for a specific category (using categoryId=1 as test)",
    method: "GET",
    pathTemplate: `/integration/product/product-categories/1/attributes`,
    category: "Catalog"
  },
  {
    id: "brands",
    name: "Brands",
    description: "Trendyol brand list (paginated)",
    method: "GET",
    pathTemplate: `/integration/product/brands?page=0&size=5`,
    category: "Catalog"
  },
  {
    id: "brands-byname",
    name: "Brands by Name",
    description: "Search brands by name",
    method: "GET",
    pathTemplate: `/integration/product/brands/by-name?name=test`,
    category: "Catalog"
  },

  // ── Orders & Shipments ──────────────────────────────────────
  {
    id: "shipments",
    name: "Shipment Packages",
    description: "Get order shipment packages",
    method: "GET",
    pathTemplate: `/integration/order/sellers/${SELLER_ID}/shipment-packages?page=0&size=5`,
    category: "Orders"
  },
  {
    id: "shipments-status",
    name: "Shipment Packages (by status)",
    description: "Get shipment packages filtered by status",
    method: "GET",
    pathTemplate: `/integration/order/sellers/${SELLER_ID}/shipment-packages?page=0&size=5&status=Created`,
    category: "Orders"
  },
  {
    id: "claims",
    name: "Claims / Returns",
    description: "Get return/claim requests",
    method: "GET",
    pathTemplate: `/integration/order/sellers/${SELLER_ID}/claims?page=0&size=5`,
    category: "Orders"
  },

  // ── Returns (GULF Region) ──────────────────────────────────
  {
    id: "returns-gulf",
    name: "Returns (GULF)",
    description: "Get return requests — GULF/SA region endpoint",
    method: "GET",
    pathTemplate: `/integration/order/sellers/${SELLER_ID}/returns?page=0&size=5`,
    category: "Returns (GULF)"
  },
  {
    id: "return-claim-issues",
    name: "Claim Issue Reasons",
    description: "Get available claim issue reasons for returns",
    method: "GET",
    pathTemplate: `/integration/order/claim-issue-reasons`,
    category: "Returns (GULF)"
  },

  // ── Seller / Account ────────────────────────────────────────
  {
    id: "addresses",
    name: "Supplier Addresses",
    description: "Seller address information",
    method: "GET",
    pathTemplate: `/integration/sellers/${SELLER_ID}/addresses`,
    category: "Seller"
  },
  {
    id: "addresses-alt",
    name: "Supplier Addresses (alt)",
    description: "Alternative address endpoint path",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/addresses`,
    category: "Seller"
  },

  // ── Delivery / Cargo ────────────────────────────────────────
  {
    id: "cargo",
    name: "Cargo Companies",
    description: "Available cargo/shipping providers",
    method: "GET",
    pathTemplate: `/integration/order/cargo-companies`,
    category: "Delivery"
  },
  {
    id: "common-label",
    name: "Common Label",
    description: "Get common shipping label for a package (test with dummy ID)",
    method: "GET",
    pathTemplate: `/integration/order/sellers/${SELLER_ID}/shipment-packages/0/common-label`,
    category: "Delivery"
  },

  // ── Accounting / Finance ────────────────────────────────────
  {
    id: "settlements",
    name: "Settlements",
    description: "Get settlement/accounting transaction list",
    method: "GET",
    pathTemplate: `/integration/finance/sellers/${SELLER_ID}/settlements?page=0&size=5`,
    category: "Accounting"
  },

  // ── Infrastructure ──────────────────────────────────────────
  {
    id: "batch",
    name: "Batch Request Result",
    description: "Check batch job status (dummy ID test)",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/batch-requests/00000000-0000-0000-0000-000000000000`,
    category: "Infrastructure"
  },
  {
    id: "webhooks",
    name: "Webhooks",
    description: "List registered webhooks",
    method: "GET",
    pathTemplate: `/integration/webhook/sellers/${SELLER_ID}`,
    category: "Infrastructure"
  },
  {
    id: "healthcheck",
    name: "API Health Check",
    description: "Check if Trendyol API gateway is reachable",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/approved?page=0&size=1`,
    category: "Infrastructure"
  }
];

const LOCAL_API_ENDPOINTS: EndpointDef[] = [
  {
    id: "app-dashboard",
    name: "Dashboard API",
    description: "Checks dashboard summary API and database connectivity",
    method: "GET",
    pathTemplate: "/api/dashboard?limit=5",
    category: "App APIs",
    target: "local"
  },
  {
    id: "app-settings",
    name: "Settings API",
    description: "Checks settings API availability",
    method: "GET",
    pathTemplate: "/api/settings",
    category: "App APIs",
    target: "local"
  },
  {
    id: "app-alerts",
    name: "Alerts API",
    description: "Checks alerts API response",
    method: "GET",
    pathTemplate: "/api/alerts",
    category: "App APIs",
    target: "local"
  },
  {
    id: "app-salla-status",
    name: "Salla Status API",
    description: "Checks Salla integration status endpoint",
    method: "GET",
    pathTemplate: "/api/integrations/salla/status",
    category: "App APIs",
    target: "local"
  }
];

const ALL_ENDPOINTS = [...LOCAL_API_ENDPOINTS, ...ENDPOINTS];

function StatusIcon({ status }: { status: TestResult["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
    case "ok":
      return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-400" />;
  }
}

function HttpBadge({ code }: { code?: number }) {
  if (!code) return null;
  const color = code >= 200 && code < 300
    ? "bg-green-500/20 text-green-400 border-green-500/30"
    : code >= 400 && code < 500
      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      : "bg-red-500/20 text-red-400 border-red-500/30";
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono", color)}>{code}</span>;
}

function JsonViewer({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  const lines = text.split("\n");
  const truncated = lines.length > 80;
  const display = truncated ? lines.slice(0, 80).join("\n") + "\n  ... (truncated)" : text;

  return (
    <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-black/40 p-3 text-xs text-green-300 font-mono whitespace-pre-wrap break-all border border-white/5">
      {display}
    </pre>
  );
}

export function ApiTestClient() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [config, setConfig] = useState<{ sellerId: string; barcode: string } | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const runLockRef = useRef(false);

  const parseJsonSafe = useCallback(async (response: Response) => {
    const raw = await response.text();
    if (!raw.trim()) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }, []);

  const runSingleTest = useCallback(async (endpoint: EndpointDef, sellerId: string, barcode: string) => {
    const sellerIdNum = Number(sellerId);
    const path = endpoint.pathTemplate
      .replace(/\{\{sellerId\}\}/g, sellerId)
      .replace(/\{\{barcode\}\}/g, barcode);

    let body = endpoint.body;
    if (body) {
      const bodyStr = JSON.stringify(body)
        .replace(/"?\{\{sellerIdNum\}\}"?/g, String(sellerIdNum))
        .replace(/\{\{sellerId\}\}/g, sellerId)
        .replace(/\{\{barcode\}\}/g, barcode);
      body = JSON.parse(bodyStr);
    }

    setResults((prev) => ({
      ...prev,
      [endpoint.id]: { id: endpoint.id, status: "running" }
    }));

    try {
      if (endpoint.target === "local") {
        const start = Date.now();
        const localRes = await fetch(path, {
          method: endpoint.method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store"
        });
        const data = await parseJsonSafe(localRes);
        const warning = data && typeof data === "object" && typeof (data as Record<string, unknown>).warning === "string"
          ? (data as Record<string, string>).warning
          : null;
        const apiError = data && typeof data === "object" && typeof (data as Record<string, unknown>).error === "string"
          ? (data as Record<string, string>).error
          : null;
        const isOk = localRes.ok && !warning;

        setResults((prev) => ({
          ...prev,
          [endpoint.id]: {
            id: endpoint.id,
            status: isOk ? "ok" : "error",
            httpStatus: localRes.status,
            durationMs: Date.now() - start,
            response: data,
            error: warning ?? apiError ?? undefined
          }
        }));
      } else {
        const res = await fetch("/api/debug/test-endpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, method: endpoint.method, body })
        });

        const data = await res.json();

        setResults((prev) => ({
          ...prev,
          [endpoint.id]: {
            id: endpoint.id,
            status: data.status === "ok" && data.httpStatus >= 200 && data.httpStatus < 300 ? "ok" : "error",
            httpStatus: data.httpStatus,
            durationMs: data.durationMs,
            response: data.response,
            error: data.error
          }
        }));
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [endpoint.id]: {
          id: endpoint.id,
          status: "error",
          error: error instanceof Error ? error.message : "Network error"
        }
      }));
    }
  }, [parseJsonSafe]);

  const runAll = useCallback(async () => {
    if (runLockRef.current) {
      return;
    }

    runLockRef.current = true;
    setRunningAll(true);
    setResults({});
    try {
      // First get config (sellerId, barcode)
      let sellerId = "";
      let barcode = "";

      try {
        const configRes = await fetch("/api/debug/config");
        if (configRes.ok) {
          const cfg = await configRes.json();
          sellerId = cfg.sellerId ?? "";
          barcode = cfg.sampleBarcode ?? "";
          setConfig({ sellerId, barcode });
        }
      } catch {
        // If config endpoint doesn't exist, try to run anyway
      }

      if (!sellerId) {
        setResults((prev) => {
          const next = { ...prev };
          for (const endpoint of ENDPOINTS) {
            next[endpoint.id] = {
              id: endpoint.id,
              status: "error",
              error: "Missing Trendyol seller configuration"
            };
          }
          return next;
        });
      } else {
        for (const endpoint of ENDPOINTS) {
          await runSingleTest(endpoint, sellerId, barcode);
        }
      }

      for (const endpoint of LOCAL_API_ENDPOINTS) {
        await runSingleTest(endpoint, sellerId, barcode);
      }
    } finally {
      setLastRunAt(Date.now());
      setRunningAll(false);
      runLockRef.current = false;
    }
  }, [runSingleTest]);

  useEffect(() => {
    void runAll();
    const timer = window.setInterval(() => {
      void runAll();
    }, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [runAll]);

  const categories = useMemo(() => [...new Set(ALL_ENDPOINTS.map((endpoint) => endpoint.category))], []);
  const working = Object.values(results).filter((r) => r.status === "ok").length;
  const failed = Object.values(results).filter((r) => r.status === "error").length;
  const total = Object.values(results).filter((r) => r.status !== "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trendyol API Tester</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live checks for Trendyol and app APIs. Auto-refresh every {LIVE_REFRESH_INTERVAL_MS / 1000}s.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {lastRunAt ? `Last run: ${new Date(lastRunAt).toLocaleTimeString()}` : "Waiting for first run..."}
          </p>
        </div>
        <Button onClick={runAll} disabled={runningAll} size="lg">
          {runningAll ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Live Testing...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Run Now
            </>
          )}
        </Button>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{working}</div>
                <div className="text-xs text-muted-foreground mt-1">Working</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">{failed}</div>
                <div className="text-xs text-muted-foreground mt-1">Failed</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Endpoints</div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {config && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Seller ID:</span>{" "}
                <code className="font-mono text-foreground">{config.sellerId}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Test Barcode:</span>{" "}
                <code className="font-mono text-foreground">{config.barcode}</code>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {categories.map((category) => (
        <div key={category}>
          <h2 className="text-lg font-semibold mb-3 text-muted-foreground">{category}</h2>
          <div className="space-y-2">
            {ALL_ENDPOINTS.filter((e) => e.category === category).map((endpoint) => {
              const result = results[endpoint.id];
              const isExpanded = expandedId === endpoint.id;

              return (
                <Card key={endpoint.id} className="overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : endpoint.id)}
                  >
                    <StatusIcon status={result?.status ?? "pending"} />

                    <Badge variant="outline" className={cn(
                      "font-mono text-[10px] px-1.5",
                      endpoint.method === "POST" ? "border-blue-500/40 text-blue-400"
                        : endpoint.method === "PUT" ? "border-orange-500/40 text-orange-400"
                        : endpoint.method === "DELETE" ? "border-red-500/40 text-red-400"
                        : "border-green-500/40 text-green-400"
                    )}>
                      {endpoint.method}
                    </Badge>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{endpoint.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{endpoint.description}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {result?.httpStatus && <HttpBadge code={result.httpStatus} />}
                      {result?.durationMs !== undefined && (
                        <span className="text-xs text-muted-foreground font-mono">{result.durationMs}ms</span>
                      )}

                      {!runningAll && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            const sellerId = config?.sellerId ?? "";
                            const barcode = config?.barcode ?? "";
                            void runSingleTest(endpoint, sellerId, barcode);
                          }}
                          disabled={endpoint.target !== "local" && !config && !runningAll}
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}

                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-white/10 px-4 py-3 bg-white/4">
                      <div className="text-xs text-muted-foreground mb-1 font-mono">
                        {endpoint.method} {endpoint.pathTemplate.replace(/\{\{sellerId\}\}/g, config?.sellerId ?? "...")}
                      </div>
                      {endpoint.body && (
                        <div className="text-xs text-muted-foreground mb-2">
                          <span className="font-semibold">Body:</span>{" "}
                          <code className="font-mono">{JSON.stringify(endpoint.body)}</code>
                        </div>
                      )}
                      {result?.error && (
                        <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">
                          {result.error}
                        </div>
                      )}
                      {result?.response !== undefined && (
                        <JsonViewer data={result.response} />
                      )}
                      {!result && (
                        <div className="text-xs text-muted-foreground italic">
                          Live testing will run this endpoint automatically.
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
