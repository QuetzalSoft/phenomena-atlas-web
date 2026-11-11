import { defineConfig, devices } from "@playwright/test";

const webPort = 3100;
const mockApiPort = 8100;
const mockApiUrl = `http://localhost:${mockApiPort}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one mock API whose mode they change, so they cannot run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/mock-api.ts",
      url: `${mockApiUrl}/health`,
      env: { MOCK_API_PORT: String(mockApiPort), WEB_ORIGIN: `http://localhost:${webPort}` },
      reuseExistingServer: !process.env.CI,
    },
    {
      // A production build, as users get it.
      command: `next build && next start --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      env: { API_URL: mockApiUrl, NEXT_PUBLIC_API_URL: mockApiUrl },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
