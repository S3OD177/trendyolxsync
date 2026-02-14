#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const resolvedUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const provider = resolvedUrl.startsWith("postgres") ? "postgresql" : "sqlite";

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", ...args],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: resolvedUrl,
      DB_PROVIDER: process.env.DB_PROVIDER || provider
    }
  }
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
