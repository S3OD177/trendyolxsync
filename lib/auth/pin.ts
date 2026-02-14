import { env } from "@/lib/config/env";

export const PIN_COOKIE_NAME = "tbg_pin_auth";

export function getExpectedPin() {
  return env.APP_PIN;
}

export function validatePin(pin: string) {
  return pin === getExpectedPin();
}
