import { prisma } from "../lib/db/prisma";

async function main() {
    const products = await prisma.product.findMany({
        where: { active: true },
        include: {
            snapshots: {
                orderBy: { checkedAt: 'desc' },
                take: 1
            }
        }
    });

    console.log(`Total Active Products: ${products.length}`);

    const noSnapshot = products.filter(p => p.snapshots.length === 0);
    console.log(`Products with NO snapshot: ${noSnapshot.length}`);
    if (noSnapshot.length > 0) {
        console.log("Sample NO snapshot SKUs:", noSnapshot.slice(0, 5).map(p => p.sku));
    }

    const withSnapshot = products.filter(p => p.snapshots.length > 0);
    const noPrice = withSnapshot.filter(p => p.snapshots[0].ourPrice === null);
    console.log(`Products with snapshot but NO Price: ${noPrice.length}`);

    const unknownBuybox = withSnapshot.filter(p => p.snapshots[0].buyboxStatus === 'UNKNOWN');
    console.log(`Products with UNKNOWN BuyBox Status: ${unknownBuybox.length}`);
    if (unknownBuybox.length > 0) {
        console.log("Sample UNKNOWN BuyBox SKUs:", unknownBuybox.slice(0, 5).map(p => ({
            sku: p.sku,
            barcode: p.barcode,
            price: p.snapshots[0].ourPrice
        })));
    }

    // Check if we have any that are "PENDING" according to logic (no check in last X time?)
    // Actually, dashboard uses `lastCheckedAt`.
}

main();
