import { syncCatalogFromTrendyol } from "../lib/trendyol/sync-catalog";
import { prisma } from "../lib/db/prisma";

async function main() {
    console.log("Clearing existing products...");
    await prisma.priceSnapshot.deleteMany({});
    await prisma.alert.deleteMany({});
    await prisma.product.deleteMany({});

    console.log("Starting full product sync (with 0-stock filter)...");
    const start = Date.now();

    try {
        const summary = await syncCatalogFromTrendyol({
            maxPages: 100,
            pageSize: 50,
            hydratePrices: true,
            createInitialSnapshots: true
        });

        const duration = (Date.now() - start) / 1000;
        console.log(`\nSync Completed in ${duration.toFixed(2)}s`);
        console.log("--------------------------------");
        console.log(`Total Synced: ${summary.totalSynced}`);
        console.log(`DB Total Products: ${summary.dbTotalProducts}`);
        console.log("--------------------------------");

    } catch (error) {
        console.error("Sync Failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
