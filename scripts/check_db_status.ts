import { prisma } from "../lib/db/prisma";

async function main() {
    const total = await prisma.product.count();
    const active = await prisma.product.count({ where: { active: true } });
    const inactive = await prisma.product.count({ where: { active: false } });

    console.log(`Total DB Products: ${total}`);
    console.log(`Active: ${active}`);
    console.log(`Inactive: ${inactive}`);

    if (inactive > 0) {
        console.log("Sample Inactive Products:");
        const samples = await prisma.product.findMany({ where: { active: false }, take: 5 });
        samples.forEach(p => console.log(` - ${p.sku} (${p.title.slice(0, 20)}...)`));
    }
}

main();
