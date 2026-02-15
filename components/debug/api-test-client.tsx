"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EndpointDef {
  id: string;
  name: string;
  description: string;
  method: "GET" | "POST";
  pathTemplate: string;
  body?: Record<string, unknown>;
  category: string;
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

const ENDPOINTS: EndpointDef[] = [
  // Product
  {
    id: "products-approved",
    name: "Products (Approved)",
    description: "Fetch approved products with price, stock, barcode, and all product fields",
    method: "GET",
    pathTemplate: `/integration/product/sellers/${SELLER_ID}/products/approved?page=0&size=5&supplierId=${SELLER_ID}`,
    category: "Product"
  },
  {
    id: "products-legacy",
    name: "Products (Legacy/All)",
    description: "Fetch all products including unapproved",
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
  {
    id: "price-inventory",
    name: "Price & Inventory Update",
    description: "Update product price and stock (POST, testing with empty items)",
    method: "POST",
    pathTemplate: `/integration/inventory/sellers/${SELLER_ID}/products/price-and-inventory`,
    body: { items: [] },
    category: "Product"
  },
  // Catalog
  {
    id: "categories",
    name: "Category Tree",
    description: "Full Trendyol category hierarchy",
    method: "GET",
    pathTemplate: `/integration/product/product-categories`,
    category: "Catalog"
  },
  {
    id: "brands",
    name: "Brands",
    description: "Trendyol brand list",
    method: "GET",
    pathTemplate: `/integration/product/brands?page=0&size=5`,
    category: "Catalog"
  },
  // Orders
  {
    id: "shipments",
    name: "Shipment Packages",
    description: "Get order shipment packages",
    method: "GET",
    pathTemplate: `/integration/order/sellers/${SELLER_ID}/shipment-packages?page=0&size=5`,
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
  // Seller
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
  // Infrastructure
  {
    id: "cargo",
    name: "Cargo Companies",
    description: "Available cargo/shipping providers",
    method: "GET",
    pathTemplate: `/integration/order/cargo-companies`,
    category: "Infrastructure"
  },
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
  }
];

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

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/test-endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `/integration/product/sellers/0/products/approved?page=0&size=1`,
          method: "GET"
        })
      });
      // We just need the sellerId from the response headers; let's use a simpler approach
      const configRes = await fetch("/api/debug/config");
      if (configRes.ok) {
        return await configRes.json();
      }
    } catch {
      // fallback
    }
    return null;
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
  }, []);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    setResults({});

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
      // Fallback: run first product endpoint to discover sellerId
      setRunningAll(false);
      return;
    }

    for (const endpoint of ENDPOINTS) {
      await runSingleTest(endpoint, sellerId, barcode);
    }

    setRunningAll(false);
  }, [runSingleTest]);

  const categories = [...new Set(ENDPOINTS.map((e) => e.category))];
  const working = Object.values(results).filter((r) => r.status === "ok").length;
  const failed = Object.values(results).filter((r) => r.status === "error").length;
  const total = Object.values(results).filter((r) => r.status !== "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trendyol API Tester</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test all Trendyol API endpoints live and see raw responses
          </p>
        </div>
        <Button onClick={runAll} disabled={runningAll} size="lg">
          {runningAll ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Test All APIs
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
                <div className="text-xs text-muted-foreground mt-1">Total Tested</div>
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
            {ENDPOINTS.filter((e) => e.category === category).map((endpoint) => {
              const result = results[endpoint.id];
              const isExpanded = expandedId === endpoint.id;

              return (
                <Card key={endpoint.id} className="overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : endpoint.id)}
                  >
                    <StatusIcon status={result?.status ?? "pending"} />

                    <Badge variant="outline" className={cn(
                      "font-mono text-[10px] px-1.5",
                      endpoint.method === "POST" ? "border-blue-500/40 text-blue-400" : "border-green-500/40 text-green-400"
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
                            if (config) {
                              runSingleTest(endpoint, config.sellerId, config.barcode);
                            }
                          }}
                          disabled={!config && !runningAll}
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}

                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/20">
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
                          Click &quot;Test All APIs&quot; or the play button to test this endpoint
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
