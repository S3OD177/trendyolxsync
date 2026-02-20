import { syncCatalogFromTrendyol } from "../lib/trendyol/sync-catalog";
import { prisma } from "../lib/db/prisma";

async function main() {
    console.log("Starting full product sync...");
    const start = Date.now();

    try {
        const summary = await syncCatalogFromTrendyol({
            maxPages: 100, // Fetch up to 100 pages (5000 products)
            pageSize: 50,
            hydratePrices: true, // This flag is now less relevant as we batch fetch, but kept for compatibility
            createInitialSnapshots: true
        });

        const duration = (Date.now() - start) / 1000;
        console.log(`\nSync Completed in ${duration.toFixed(2)}s`);
        console.log("--------------------------------");
        console.log(`Total Synced: ${summary.totalSynced}`);
        console.log(`Pages Fetched: ${summary.pagesFetched}`);
        console.log(`Hydrated Snapshots: ${summary.hydratedSnapshots}`);
        console.log(`Hydration Errors: ${summary.hydrationErrors}`);
        console.log(`DB Total Products: ${summary.dbTotalProducts}`);
        console.log("--------------------------------");

    } catch (error) {
        console.error("Sync Failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
