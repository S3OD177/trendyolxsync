#!/usr/bin/env node
const { spawn, spawnSync } = require("node:child_process");

const resolvedUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const provider = resolvedUrl.startsWith("postgres") ? "postgresql" : "sqlite";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nextCommand = process.platform === "win32" ? "next.cmd" : "next";

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: resolvedUrl,
      DB_PROVIDER: provider
    }
  });

  return result.status ?? 1;
}

if (provider === "postgresql") {
  console.log("Applying Prisma migrations (migrate deploy)...");
  const migrateStatus = runCommand(npxCommand, ["prisma", "migrate", "deploy"]);

  if (migrateStatus !== 0) {
    console.log("migrate deploy failed, attempting prisma db push fallback...");
    const pushStatus = runCommand(npxCommand, ["prisma", "db", "push", "--accept-data-loss"]);
    if (pushStatus !== 0) {
      process.exit(pushStatus);
    }
  }
} else {
  console.log("Applying SQLite schema (db push)...");
  const pushStatus = runCommand(npxCommand, ["prisma", "db", "push"]);
  if (pushStatus !== 0) {
    process.exit(pushStatus);
  }
}

const child = spawn(nextCommand, ["start"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: resolvedUrl,
    DB_PROVIDER: provider
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
