import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.e2e.ts", "src/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
