import { expect, test } from "@playwright/test";
import type { HealthMode } from "./mock-api";

const mockApiUrl = "http://localhost:8100";

async function setHealthMode(mode: HealthMode) {
  const response = await fetch(`${mockApiUrl}/__mock/health-mode`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
  expect(response.ok).toBe(true);
}

test.afterEach(async () => {
  await setHealthMode("ok");
});

test("shows the API as operational from the server and from the browser", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByTestId("server-health-status")).toHaveText("Operational");
  await expect(page.getByTestId("browser-health-status")).toHaveText("Operational");
  await expect(page.getByTestId("browser-health")).toContainText(mockApiUrl);
});

test("shows the API as unreachable when it does not answer", async ({ page }) => {
  await setHealthMode("unreachable");

  await page.goto("/dashboard");

  await expect(page.getByTestId("server-health-status")).toHaveText("Unreachable");
  await expect(page.getByTestId("browser-health-status")).toHaveText("Unreachable");
  await expect(page.getByTestId("browser-health")).toContainText("The API did not answer");
});

test("shows the contract error code when the API fails", async ({ page }) => {
  await setHealthMode("failed");

  await page.goto("/dashboard");

  await expect(page.getByTestId("server-health-status")).toHaveText("Error");
  await expect(page.getByTestId("server-health")).toContainText("HTTP 503");
  await expect(page.getByTestId("server-health")).toContainText("service_unavailable");
});

test("recovers in the browser when the API comes back", async ({ page }) => {
  await setHealthMode("unreachable");
  await page.goto("/dashboard");
  await expect(page.getByTestId("browser-health-status")).toHaveText("Unreachable");

  await setHealthMode("ok");
  await page.getByRole("button", { name: "Check again" }).click();

  await expect(page.getByTestId("browser-health-status")).toHaveText("Operational");
});
