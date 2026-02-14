import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/config/env";

declare global {
  var __prisma__: PrismaClient | undefined;
}

const createClient = () =>
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

export const prisma = global.__prisma__ ?? createClient();

if (env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}
