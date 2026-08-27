import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["fixtures/**", "dist/**", "node_modules/**"],
  },
});
