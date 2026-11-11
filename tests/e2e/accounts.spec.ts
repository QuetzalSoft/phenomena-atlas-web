import { expect, test, type Page } from "@playwright/test";
import type { RoleChangeFailure, SeedAccount } from "./mock-api";

const mockApiUrl = "http://localhost:8100";

async function mock(path: string, body: unknown) {
  const response = await fetch(`${mockApiUrl}/__mock/${path}`, { method: "POST", body: JSON.stringify(body) });
  expect(response.ok).toBe(true);
}

const reset = (seed: SeedAccount[] = []) => mock("reset", { seed });

/** Fills in Keycloak's own login page, which the site redirects to. */
async function logInAtKeycloak(page: Page, username: string, password = username) {
  await expect(page).toHaveURL(/\/realms\/phenomena-atlas\/protocol\/openid-connect\/auth/);
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

async function signInFromHeader(page: Page, username: string) {
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await logInAtKeycloak(page, username);
}

function row(page: Page, username: string) {
  return page.getByTestId("account-row").filter({ hasText: username });
}

test.beforeEach(async () => {
  await reset();
});

test("an anonymous visitor is sent to sign in and comes back to the accounts", async ({ page }) => {
  await page.goto("/admin/accounts");

  await logInAtKeycloak(page, "admin");

  await expect(page).toHaveURL("/admin/accounts");
  await expect(page.getByRole("heading", { name: "Accounts and roles" })).toBeVisible();
  await expect(row(page, "admin")).toContainText("You");
  await expect(page.getByTestId("signed-in-as")).toContainText("Admin User");
  await expect(page.getByTestId("signed-in-as")).toContainText("Admin");
});

test("a user is told the page needs the admin role", async ({ page }) => {
  await page.goto("/");
  await signInFromHeader(page, "dev");
  await expect(page.getByTestId("signed-in-as")).toContainText("Dev User");
  await expect(page.getByTestId("signed-in-as")).toContainText("User");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Accounts" })).toHaveCount(0);

  await page.goto("/admin/accounts");

  await expect(page.getByTestId("admin-required")).toContainText("This page needs the admin role");
  await expect(page.getByTestId("accounts-table")).toHaveCount(0);
  await expect(page.getByTestId("role-definitions")).toContainText("Your role");
});

test("an admin pages through every account", async ({ page }) => {
  await reset(Array.from({ length: 55 }, (_, index) => ({ username: `person-${index + 1}`, role: "user" })));

  await page.goto("/");
  await signInFromHeader(page, "admin");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Accounts" }).click();

  await expect(page.getByTestId("account-row")).toHaveCount(50);
  await expect(page.getByTestId("accounts-count")).toHaveText("50 accounts loaded");

  await page.getByRole("button", { name: "Load more" }).click();

  await expect(page.getByTestId("account-row")).toHaveCount(56);
  await expect(page.getByTestId("accounts-count")).toHaveText("56 accounts");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("an admin changes another account's role, and it sticks", async ({ page }) => {
  await reset([{ username: "carol", role: "user" }]);
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");

  await row(page, "carol").getByRole("combobox").selectOption("analyst");

  await expect(row(page, "carol").getByRole("combobox")).toBeEnabled();
  await page.reload();
  await expect(row(page, "carol").getByRole("combobox")).toHaveValue("analyst");
});

test("an admin cannot change their own role", async ({ page }) => {
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");

  const own = row(page, "admin");
  await expect(own.getByRole("combobox")).toBeDisabled();
  await expect(own).toContainText("Another admin has to change your role.");
});

test("a refused role change explains why and keeps the old role", async ({ page }) => {
  await reset([{ username: "carol", role: "user" }]);
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");
  const failure: RoleChangeFailure = { status: 403, code: "own_role_change_forbidden" };
  await mock("role-change-failure", failure);

  await row(page, "carol").getByRole("combobox").selectOption("admin");

  await expect(row(page, "carol").getByRole("alert")).toHaveText(
    "You cannot change your own role. Another admin has to do it.",
  );
  await expect(row(page, "carol").getByRole("combobox")).toHaveValue("user");
});

test("an expired session asks to sign in again", async ({ page }) => {
  await reset([{ username: "carol", role: "user" }]);
  await page.goto("/admin/accounts");
  await logInAtKeycloak(page, "admin");
  const failure: RoleChangeFailure = { status: 401, code: "unauthorized" };
  await mock("role-change-failure", failure);

  await row(page, "carol").getByRole("combobox").selectOption("analyst");

  await expect(row(page, "carol").getByRole("alert")).toContainText("Your session has expired.");
  await expect(row(page, "carol").getByRole("link", { name: "Sign in again" })).toBeVisible();
});

test("signing out ends the Keycloak session too", async ({ page }) => {
  await page.goto("/");
  await signInFromHeader(page, "admin");
  await expect(page.getByTestId("signed-in-as")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  // Keycloak asks for the password again instead of signing straight back in.
  await page.goto("/admin/accounts");
  await expect(page.locator("#password")).toBeVisible();
});
