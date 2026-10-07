import { defineConfig } from "vitest/config";

// One runner for every package: pure modules get unit tests, UI does not.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
});
