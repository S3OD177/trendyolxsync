#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { loadDotEnvIfPresent } = require("./load-env.cjs");

loadDotEnvIfPresent();

const args = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must be set to a PostgreSQL URL (postgresql:// or postgres://).");
  process.exit(1);
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", ...args],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    }
  }
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
