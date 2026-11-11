import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for plain modules. Anything that needs a browser, a page or the map is covered
// by the Playwright suite in tests/e2e instead.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
