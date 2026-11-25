import { expect, test, type Page } from "@playwright/test";
import type { ProfileFailure, SeedAccount } from "./mock-api";

const mockApiUrl = "http://localhost:8100";

async function mock(path: string, body: unknown) {
  const response = await fetch(`${mockApiUrl}/__mock/${path}`, { method: "POST", body: JSON.stringify(body) });
  expect(response.ok).toBe(true);
}

const reset = (seed: SeedAccount[] = []) => mock("reset", { seed });
const failNextEdit = (failure: ProfileFailure) => mock("profile-failure", failure);

/** Fills in Keycloak's own login page, which the site redirects to. */
async function logInAtKeycloak(page: Page, username: string, password = username) {
  await expect(page).toHaveURL(/\/realms\/phenomena-atlas\/protocol\/openid-connect\/auth/);
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

async function fillDetails(scope: Page | ReturnType<Page["locator"]>, details: { firstName?: string; lastName?: string; email?: string }) {
  if (details.firstName !== undefined) await scope.getByLabel("First name").fill(details.firstName);
  if (details.lastName !== undefined) await scope.getByLabel("Last name").fill(details.lastName);
  if (details.email !== undefined) await scope.getByLabel("Email").fill(details.email);
}

/**
 * The row of the account with this email, found once and then by its id, so it stays the same
 * row after an edit changes the text it was found by.
 */
async function rowOfEmail(page: Page, email: string) {
  const id = await page.getByTestId("account-row").filter({ hasText: email }).getAttribute("data-account-id");
  return page.locator(`[data-account-id="${id}"]`);
}

test.beforeEach(async () => {
  await reset();
});

test("an anonymous visitor is sent to sign in and comes back to their account", async ({ page }) => {
  await page.goto("/account");

  await logInAtKeycloak(page, "dev");

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Dev");
  await expect(page.getByLabel("Last name")).toHaveValue("User");
  await expect(page.getByLabel("Email")).toHaveValue("dev@phenomena-atlas.local");
});

test("someone edits their own details and the header shows the new name", async ({ page }) => {
  await page.goto("/account");
  await logInAtKeycloak(page, "dev");

  await fillDetails(page, { firstName: "Devon", lastName: "Edited", email: "devon.edited@example.test" });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByTestId("signed-in-as")).toContainText("Devon Edited");
  // Still there after loading the page again.
  await page.reload();
  await expect(page.getByLabel("First name")).toHaveValue("Devon");
  await expect(page.getByLabel("Email")).toHaveValue("devon.edited@example.test");
  await expect(page.getByTestId("signed-in-as")).toContainText("Devon Edited");
});

test("the form shows the details as they were saved", async ({ page }) => {
  await page.goto("/account");
  await logInAtKeycloak(page, "dev");

  await fillDetails(page, { email: "  Devon@Example.TEST " });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("devon@example.test");
});

test("an expired session is told to sign in again", async ({ page }) => {
  await page.goto("/account");
  await logInAtKeycloak(page, "dev");
  await failNextEdit({ status: 401, code: "unauthorized" });

  await fillDetails(page, { firstName: "Devon" });
  await page.getByRole("button", { name: "Save" }).click();

  const alert = page.getByTestId("account-form").getByRole("alert");
  await expect(alert).toHaveText("Your session has expired. Sign in again");
  await expect(alert.getByRole("link", { name: "Sign in again" })).toBeVisible();
});

test("the header name leads to the account page", async ({ page }) => {
  await page.goto("/account");
  await logInAtKeycloak(page, "dev");
  await page.goto("/dashboard");

  await page.getByTestId("signed-in-as").getByRole("link", { name: "Dev User" }).click();

  await expect(page).toHaveURL("/account");
});

test("an email another account has is refused, and nothing changes", async ({ page }) => {
  await reset([{ username: "ana", role: "user", name: "Ana Perez" }]);
  await page.goto("/account");
  await logInAtKeycloak(page, "dev");

  await fillDetails(page, { firstName: "Devon", email: "ana@example.test" });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("account-form").getByRole("alert")).toContainText("Another account already uses that email");
  await expect(page.getByText("Details saved.")).toHaveCount(0);
  await expect(page.getByTestId("signed-in-as")).toContainText("Dev User");
});

test("an identity provider that cannot be reached says nothing was changed", async ({ page }) => {
  await page.goto("/account");
  await logInAtKeycloak(page, "dev");
  await failNextEdit({ status: 503, code: "account_update_unavailable" });

  await fillDetails(page, { firstName: "Devon" });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("account-form").getByRole("alert")).toContainText("Nothing was changed");
  await expect(page.getByTestId("signed-in-as")).toContainText("Dev User");
  // Trying again, once it works, saves.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByTestId("signed-in-as")).toContainText("Devon User");
});

test("an admin edits another account's details from the accounts page", async ({ page }) => {
  await reset([{ username: "ana", role: "user", name: "Ana Perez" }]);
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");
  const row = await rowOfEmail(page, "ana@example.test");

  await row.getByRole("button", { name: "Edit details" }).click();
  await expect(row.getByLabel("First name")).toHaveValue("Ana");
  await expect(row.getByLabel("Last name")).toHaveValue("Perez");
  await fillDetails(row, { lastName: "Soto", email: "ana.soto@example.test" });
  await row.getByRole("button", { name: "Save" }).click();

  await expect(row.getByTestId("account-edit-form")).toHaveCount(0);
  await expect(row).toContainText("Ana Soto");
  await expect(row).toContainText("ana.soto@example.test");
});

test("an admin whose edit is refused keeps the form open", async ({ page }) => {
  await reset([{ username: "ana", role: "user", name: "Ana Perez" }]);
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");
  const row = await rowOfEmail(page, "ana@example.test");

  await row.getByRole("button", { name: "Edit details" }).click();
  // The admin's own email, which the account list already holds.
  await fillDetails(row, { email: "admin@phenomena-atlas.local" });
  await row.getByRole("button", { name: "Save" }).click();

  await expect(row.getByRole("alert")).toContainText("Another account already uses that email");
  await expect(row.getByTestId("account-edit-form")).toBeVisible();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("Ana Perez");
});

test("an admin's own row leads to their account page", async ({ page }) => {
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");
  const row = page.getByTestId("account-row").filter({ hasText: "admin" });

  await row.getByRole("link", { name: "Edit your details" }).click();

  await expect(page).toHaveURL("/account");
});
