#!/usr/bin/env node
const { spawn, spawnSync } = require("node:child_process");
const { loadDotEnvIfPresent } = require("./load-env.cjs");

loadDotEnvIfPresent();

const databaseUrl = process.env.DATABASE_URL;
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nextCommand = process.platform === "win32" ? "next.cmd" : "next";

if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must be set to a PostgreSQL URL (postgresql:// or postgres://).");
  process.exit(1);
}

function runCommand(command, args, stdinData) {
  const result = spawnSync(command, args, {
    stdio: stdinData ? ["pipe", "inherit", "inherit"] : "inherit",
    input: stdinData || undefined,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    }
  });

  return result.status ?? 1;
}

// Fix stale migration records: if a migration is marked as applied but the
// table doesn't exist, remove the record so migrate deploy re-applies it.
console.log("Checking for stale migration records...");
const repairStatus = runCommand(npxCommand, [
  "prisma", "db", "execute", "--url", databaseUrl, "--stdin"
], `
  DO $$
  BEGIN
    -- If shipment_packages table is missing but migration is recorded, remove the record
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipment_packages')
       AND EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '0002_add_shipment_packages')
    THEN
      DELETE FROM _prisma_migrations WHERE migration_name = '0002_add_shipment_packages';
      RAISE NOTICE 'Removed stale migration record for 0002_add_shipment_packages';
    END IF;
  END $$;
`);
if (repairStatus !== 0) {
  console.log("Migration repair check failed (non-fatal), continuing...");
}

console.log("Applying Prisma migrations (migrate deploy)...");
const migrateStatus = runCommand(npxCommand, ["prisma", "migrate", "deploy"]);

if (migrateStatus !== 0) {
  console.log("migrate deploy failed, attempting prisma db push fallback...");
  const pushStatus = runCommand(npxCommand, ["prisma", "db", "push", "--accept-data-loss"]);
  if (pushStatus !== 0) {
    process.exit(pushStatus);
  }
}

const child = spawn(nextCommand, ["start"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
