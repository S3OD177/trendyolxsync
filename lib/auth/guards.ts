import { NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import { getIdentityFromRequest, upsertUserFromIdentity } from "@/lib/auth/cloudflare";

export async function requireApiUser(request: NextRequest) {
  const identity = await getIdentityFromRequest(request);

  if (!identity) {
    return null;
  }

  return upsertUserFromIdentity(identity);
}

export function requireCronSecret(request: NextRequest) {
  const secret =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return !!secret && secret === env.CRON_SECRET;
}
