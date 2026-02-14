export interface CloudflareIdentity {
  email: string;
  subject: string;
  payload: Record<string, string>;
}

function normalizeEmail(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractIdentityFromHeaders(getHeader: (name: string) => string | null): CloudflareIdentity {
  const upstreamEmail =
    normalizeEmail(getHeader("cf-access-authenticated-user-email")) ||
    normalizeEmail(getHeader("x-user-email")) ||
    "edge-admin@local";

  return {
    email: upstreamEmail,
    subject: upstreamEmail,
    payload: {
      email: upstreamEmail,
      sub: upstreamEmail
    }
  };
}
