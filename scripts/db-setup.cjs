#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { loadDotEnvIfPresent } = require("./load-env.cjs");

loadDotEnvIfPresent();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must be set to a PostgreSQL URL (postgresql:// or postgres://).");
  process.exit(1);
}

const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "dev", "--name", "init"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

process.exit(result.status ?? 1);
