import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}", "app/**/__tests__/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    maxWorkers: 2,
  },
});
