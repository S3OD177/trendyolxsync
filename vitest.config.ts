import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@127.0.0.1:5432/trendyolxsync_test"
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});
