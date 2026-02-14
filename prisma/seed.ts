import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const defaultVatRate = process.env.DEFAULT_VAT_RATE ? Number(process.env.DEFAULT_VAT_RATE) : 15;
  const defaultCooldownMinutes = process.env.DEFAULT_COOLDOWN_MINUTES
    ? Number(process.env.DEFAULT_COOLDOWN_MINUTES)
    : 15;

  const existingGlobalSettings = await prisma.globalSettings.findFirst();

  if (!existingGlobalSettings) {
    await prisma.globalSettings.create({
      data: {
        currency: "SAR",
        vatRate: defaultVatRate,
        cooldownMinutes: defaultCooldownMinutes
      }
    });
  }

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
