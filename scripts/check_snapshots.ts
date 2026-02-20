import { prisma } from "../lib/db/prisma";

async function main() {
    const sku = "1332879297";
    const product = await prisma.product.findUnique({
        where: { sku },
        include: {
            snapshots: {
                orderBy: { checkedAt: 'desc' }
            }
        }
    });

    if (!product) {
        console.log(`Product ${sku} NOT FOUND`);
        return;
    }

    console.log(`Product ${sku} found. Snapshots: ${product.snapshots.length}`);
    product.snapshots.forEach((snap, i) => {
        console.log(`[${i}] Status: ${snap.buyboxStatus} | Date: ${snap.checkedAt} | Price: ${snap.ourPrice}`);
    });
}

main();
