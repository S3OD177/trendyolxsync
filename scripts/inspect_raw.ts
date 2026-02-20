import { prisma } from "../lib/db/prisma";

async function main() {
    const product = await prisma.product.findFirst({
        where: { sku: '194644084981' },
        include: {
            snapshots: {
                orderBy: { checkedAt: 'desc' },
                take: 1
            }
        }
    });

    if (!product || !product.snapshots.length) {
        console.log("Product or snapshot not found");
        return;
    }

    const raw = product.snapshots[0].rawPayloadJson as any;
    console.log(JSON.stringify(raw, null, 2));
}

main();
