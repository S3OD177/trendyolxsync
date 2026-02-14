import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  isLocalBypassEnabled,
  verifyCloudflareToken,
  type CloudflareIdentity
} from "@/lib/auth/cloudflare-core";

export async function getIdentityFromRequest(request: NextRequest): Promise<CloudflareIdentity | null> {
  const token = request.headers.get("cf-access-jwt-assertion");

  if (!token) {
    if (isLocalBypassEnabled) {
      return {
        email: "local-admin@example.com",
        subject: "local-admin",
        payload: { email: "local-admin@example.com", sub: "local-admin" }
      };
    }

    return null;
  }

  return verifyCloudflareToken(token);
}

export async function getIdentityFromHeaders(): Promise<CloudflareIdentity | null> {
  const h = headers();
  const token = h.get("cf-access-jwt-assertion");

  if (!token) {
    if (isLocalBypassEnabled) {
      return {
        email: "local-admin@example.com",
        subject: "local-admin",
        payload: { email: "local-admin@example.com", sub: "local-admin" }
      };
    }

    return null;
  }

  return verifyCloudflareToken(token);
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
  if (!identity) {
    throw new Error("Unauthorized");
  }

  return upsertUserFromIdentity(identity);
}
