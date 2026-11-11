import { defineConfig, devices } from "@playwright/test";

const webPort = 3100;
const webUrl = `http://localhost:${webPort}`;
const mockApiPort = 8100;
const mockApiUrl = `http://localhost:${mockApiPort}`;
const keycloakPort = 8190;
const keycloakIssuer = `http://localhost:${keycloakPort}/realms/phenomena-atlas`;

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one mock API whose state they change, so they cannot run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/mock-api.ts",
      url: `${mockApiUrl}/health`,
      env: { MOCK_API_PORT: String(mockApiPort), WEB_ORIGIN: webUrl },
      reuseExistingServer: !process.env.CI,
    },
    {
      // A real Keycloak, on the image the API's compose.yaml uses. The realm is the API
      // repository's keycloak/phenomena-atlas-realm.json with the web client on :3100;
      // keep the two in step.
      command: [
        "docker run --rm --name phenomena-atlas-web-e2e-keycloak",
        `-p ${keycloakPort}:8080`,
        "-v ./tests/e2e/keycloak-realm.json:/opt/keycloak/data/import/phenomena-atlas-realm.json:ro",
        "quay.io/keycloak/keycloak:26.8.1 start-dev --import-realm",
      ].join(" "),
      url: `${keycloakIssuer}/.well-known/openid-configuration`,
      timeout: 120_000,
      // SIGTERM reaches the container through `docker run`, which then removes it. The
      // default kill would leave it running.
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      reuseExistingServer: !process.env.CI,
    },
    {
      // A production build, as users get it.
      command: `next build && next start --port ${webPort}`,
      url: webUrl,
      env: {
        API_URL: mockApiUrl,
        NEXT_PUBLIC_API_URL: mockApiUrl,
        AUTH_URL: webUrl,
        AUTH_SECRET: "end-to-end-tests-only-not-a-real-secret",
        AUTH_KEYCLOAK_ID: "phenomena-atlas-web",
        AUTH_KEYCLOAK_ISSUER: keycloakIssuer,
        // A blank basemap, so tests need no tile server; and the map exposed to the tests.
        NEXT_PUBLIC_MAP_STYLE_URL: "",
        NEXT_PUBLIC_E2E: "true",
      },
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
