#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const resolvedUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const provider = resolvedUrl.startsWith("postgres") ? "postgresql" : "sqlite";

const command =
  provider === "postgresql"
    ? ["prisma", "migrate", "dev", "--name", "init"]
    : ["prisma", "db", "push"];

const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", command, {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: resolvedUrl,
    DB_PROVIDER: provider
  }
});

process.exit(result.status ?? 1);
