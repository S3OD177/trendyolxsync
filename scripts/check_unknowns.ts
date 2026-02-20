import { prisma } from "../lib/db/prisma";

async function main() {
    const unknowns = await prisma.product.findMany({
        where: {
            snapshots: {
                some: { buyboxStatus: 'UNKNOWN' }
            }
        },
        include: {
            snapshots: {
                orderBy: { checkedAt: 'desc' },
                take: 1
            }
        }
    });

    console.log(`Products with UNKNOWN status: ${unknowns.length}`);

    if (unknowns.length > 0) {
        console.log("Samples:");
        unknowns.slice(0, 5).forEach(p => {
            const snap = p.snapshots[0];
            console.log(`- SKU: ${p.sku} | Price: ${snap.ourPrice} | Raw Keys: ${snap.rawPayloadJson ? Object.keys(snap.rawPayloadJson as any).slice(0, 3).join(',') : 'None'}`);
        });
    }
}

main();
