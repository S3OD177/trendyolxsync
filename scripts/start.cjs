#!/usr/bin/env node
const { spawn, spawnSync } = require("node:child_process");

const resolvedUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const provider = resolvedUrl.startsWith("postgres") ? "postgresql" : "sqlite";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nextCommand = process.platform === "win32" ? "next.cmd" : "next";

function runBlocking(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: resolvedUrl,
      DB_PROVIDER: provider
    }
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (provider === "postgresql") {
  console.log("Applying Prisma migrations (migrate deploy)...");
  runBlocking(npxCommand, ["prisma", "migrate", "deploy"]);
} else {
  console.log("Applying SQLite schema (db push)...");
  runBlocking(npxCommand, ["prisma", "db", "push"]);
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
