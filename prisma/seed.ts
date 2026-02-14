import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD;
  const defaultVatRate = process.env.DEFAULT_VAT_RATE ? Number(process.env.DEFAULT_VAT_RATE) : 15;
  const defaultCooldownMinutes = process.env.DEFAULT_COOLDOWN_MINUTES
    ? Number(process.env.DEFAULT_COOLDOWN_MINUTES)
    : 15;

  const passwordHash = adminPassword ? await bcrypt.hash(adminPassword, 10) : null;

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      name: "Admin"
    },
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash
    }
  });

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
