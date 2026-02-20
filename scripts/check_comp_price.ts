import { prisma } from "../lib/db/prisma";

async function main() {
    const sku = "1332879297";
    const product = await prisma.product.findUnique({
        where: { sku },
        include: { snapshots: { orderBy: { checkedAt: 'desc' }, take: 1 } }
    });

    if (product && product.snapshots.length) {
        console.log(`Snapshot details for ${sku}:`);
        console.log(`- BuyBox Status: ${product.snapshots[0].buyboxStatus}`);
        console.log(`- Competitor Min Price: ${product.snapshots[0].competitorMinPrice}`);
    }
}

main();
