import fs from "fs";
import path from "path";

// Load .env manually since dotenv might not be present/working with tsx in this setup
try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, "utf8");
        envConfig.split("\n").forEach((line) => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
            }
        });
    }
} catch (e) {
    console.error("Failed to load .env", e);
}

import { TrendyolClient } from "../lib/trendyol/client";

const trendyolClient = new TrendyolClient({
    supplierId: "1111632",
    apiKey: "HcZNldzO9aEBwToN6cQk",
    apiSecret: "aKNCQL4NibLBxAdpYSNT"
});

async function main() {
    console.log("--- Testing 'Approved' Endpoint ---");
    try {
        const { items } = await trendyolClient.fetchProducts(0, 50);
        console.log(`Default fetchProducts (likely Approved): ${items.length} items`);
    } catch (e) { console.error("Default fetch failed", e); }

    console.log("\n--- Testing 'Legacy' (All Products) Endpoint ---");
    try {
        const legacyPath = `/integration/product/sellers/${trendyolClient.getSellerId()}/products?page=0&size=50`;
        const result = await trendyolClient.testEndpoint(legacyPath);
        const body = result.body as any;
        console.log(`Legacy Endpoint Status: ${result.status}`);
        if (body && body.content) {
            console.log(`Legacy Endpoint Items (Page 0): ${body.content.length}`);
            console.log(`Legacy Endpoint Total Elements: ${body.totalElements}`);
        } else {
            console.log("Legacy body:", JSON.stringify(body).slice(0, 200));
        }
    } catch (e) { console.error("Legacy fetch failed", e); }
}

main();
