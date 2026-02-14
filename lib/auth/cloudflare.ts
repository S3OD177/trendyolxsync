import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  extractIdentityFromHeaders,
  type CloudflareIdentity
} from "@/lib/auth/cloudflare-core";

export async function getIdentityFromRequest(request: NextRequest): Promise<CloudflareIdentity> {
  return extractIdentityFromHeaders((name) => request.headers.get(name));
}

export async function getIdentityFromHeaders(): Promise<CloudflareIdentity> {
  const h = headers();
  return extractIdentityFromHeaders((name) => h.get(name));
}

export async function upsertUserFromIdentity(identity: CloudflareIdentity) {
  return prisma.user.upsert({
    where: { email: identity.email },
    update: {
      name: identity.subject
    },
    create: {
      email: identity.email,
      name: identity.subject
    }
  });
}

export async function requireUserFromServerHeaders() {
  const identity = await getIdentityFromHeaders();
  return upsertUserFromIdentity(identity);
}
