import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JwtPayload } from "jose";
import { env } from "@/lib/config/env";

export interface CloudflareIdentity {
  email: string;
  subject: string;
  payload: JwtPayload;
}

const localBypass = env.AUTH_BYPASS_LOCAL === "1" && env.NODE_ENV !== "production";

const jwks = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN
  ? createRemoteJWKSet(
      new URL(`https://${env.CLOUDFLARE_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)
    )
  : null;

function parseIdentityFromPayload(payload: JwtPayload): CloudflareIdentity {
  const email =
    typeof payload.email === "string"
      ? payload.email
      : typeof payload["sub"] === "string"
        ? payload.sub
        : "unknown@example.com";

  return {
    email,
    subject: typeof payload.sub === "string" ? payload.sub : email,
    payload
  };
}

export async function verifyCloudflareToken(token: string): Promise<CloudflareIdentity | null> {
  if (localBypass) {
    return {
      email: "local-admin@example.com",
      subject: "local-admin",
      payload: { email: "local-admin@example.com", sub: "local-admin" }
    };
  }

  if (!jwks || !env.CLOUDFLARE_ACCESS_AUDIENCE) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: env.CLOUDFLARE_ACCESS_AUDIENCE
    });

    return parseIdentityFromPayload(payload);
  } catch {
    return null;
  }
}

export const isLocalBypassEnabled = localBypass;
