import { prisma } from "@/lib/db/prisma";

export async function acquireJobLock(name: string, owner: string, ttlSeconds = 240): Promise<boolean> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlSeconds * 1000);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.jobLock.findUnique({ where: { name } });

    if (existing && existing.lockedUntil > now) {
      return false;
    }

    await tx.jobLock.upsert({
      where: { name },
      update: {
        owner,
        lockedUntil
      },
      create: {
        name,
        owner,
        lockedUntil
      }
    });

    return true;
  });
}

export async function releaseJobLock(name: string, owner: string): Promise<void> {
  await prisma.jobLock.updateMany({
    where: {
      name,
      owner
    },
    data: {
      lockedUntil: new Date(Date.now() - 1000)
    }
  });
}
