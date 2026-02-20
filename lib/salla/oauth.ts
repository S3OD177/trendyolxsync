import crypto from "node:crypto";

export const SALLA_OAUTH_STATE_COOKIE = "salla_oauth_state";
export const SALLA_OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export function createSallaOAuthState() {
  return crypto.randomBytes(24).toString("hex");
}
