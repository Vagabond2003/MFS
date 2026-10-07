import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the server-side code (ledger, policy, handlers, intelligence, AI guard, i18n coverage).
// Everything runs in Node against in-memory data: no database, no network.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Generating a synthetic dataset takes ~0.5 s; PIN checks run PBKDF2.
    testTimeout: 30_000,
  },
});
