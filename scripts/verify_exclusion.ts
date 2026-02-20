import { prisma } from "../lib/db/prisma";

async function main() {
    const excludedSku = '194644084981';
    const product = await prisma.product.findUnique({
        where: { sku: excludedSku }
    });

    if (product) {
        console.log(`FAIL: Product ${excludedSku} found in DB!`);
    } else {
        console.log(`SUCCESS: Product ${excludedSku} NOT found in DB.`);
    }

    const count = await prisma.product.count();
    console.log(`Total Products in DB: ${count}`);
}

main();
