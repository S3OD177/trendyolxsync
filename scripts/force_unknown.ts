import { prisma } from "../lib/db/prisma";

async function main() {
    const sku = "1332879297";
    const product = await prisma.product.findUnique({
        where: { sku },
        include: { snapshots: { orderBy: { checkedAt: 'desc' }, take: 1 } }
    });

    if (!product || !product.snapshots.length) {
        console.log("Product snapshot not found");
        return;
    }

    const snapshotId = product.snapshots[0].id;
    await prisma.priceSnapshot.update({
        where: { id: snapshotId },
        data: { buyboxStatus: 'UNKNOWN' }
    });

    console.log(`Forced snapshot ${snapshotId} for SKU ${sku} to UNKNOWN.`);
}

main();
