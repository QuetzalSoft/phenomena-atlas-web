import { expect, test, type Page } from "@playwright/test";
import type { SeedAccount } from "./mock-api";

const mockApiUrl = "http://localhost:8100";

async function reset(seed: SeedAccount[]) {
  const response = await fetch(`${mockApiUrl}/__mock/reset`, { method: "POST", body: JSON.stringify({ seed }) });
  expect(response.ok).toBe(true);
}

const people: SeedAccount[] = [
  { username: "ana", name: "Ana Pérez", role: "user", createdAt: "2026-01-05T09:00:00.000Z" },
  { username: "andres", role: "analyst", createdAt: "2026-01-20T09:00:00.000Z" },
  { username: "ari", role: "analyst", createdAt: "2026-02-10T09:00:00.000Z" },
  { username: "bea", name: "Bea Ramos", role: "admin", createdAt: "2026-02-15T23:59:00.000Z" },
  { username: "ben", role: "analyst", createdAt: "2026-03-01T09:00:00.000Z" },
];

/** Signs in as the admin straight into the accounts page, with `query` as its filters. */
async function openAccounts(page: Page, query = "") {
  await page.goto(`/admin/accounts${query}`);
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("admin");
  await page.locator("#kc-login").click();
  await expect(page.getByTestId("accounts-table")).toBeVisible();
}

/** Exactly these seed people are listed, matched by their unique email. */
async function expectListed(page: Page, usernames: string[]) {
  const rows = page.getByTestId("account-row");
  await expect(rows).toHaveCount(usernames.length);
  for (const username of usernames) {
    await expect(rows.filter({ hasText: `${username}@example.test` })).toHaveCount(1);
  }
}

const search = (page: Page) => page.getByRole("searchbox", { name: "Search" });
const roleFilter = (page: Page) => page.getByLabel("Role", { exact: true });
const from = (page: Page) => page.getByLabel("Created from");
const to = (page: Page) => page.getByLabel("Created to");

test.beforeEach(async () => {
  await reset(people);
});

test("search matches the username, name or email, ignoring case", async ({ page }) => {
  await openAccounts(page);

  await search(page).fill("RAMOS");
  await expectListed(page, ["bea"]);
  await expect(page.getByTestId("accounts-count")).toHaveText("1 matching account");

  await search(page).fill("an");
  await expectListed(page, ["ana", "andres"]);
});

test("keeps a search typed before the page has hydrated", async ({ page }) => {
  await openAccounts(page);
  // Hold back the page's JavaScript, so the server-rendered search box is typed into first.
  let release!: () => void;
  const scriptsHeld = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await scriptsHeld;
    await route.continue();
  });
  await page.goto("/admin/accounts", { waitUntil: "commit" });
  await search(page).fill("RAMOS");

  release();

  await expect(page).toHaveURL(/q=RAMOS/);
  await expectListed(page, ["bea"]);
});

test("filters by role", async ({ page }) => {
  await openAccounts(page);

  await roleFilter(page).selectOption("analyst");

  await expectListed(page, ["andres", "ari", "ben"]);
  await expect(page).toHaveURL(/role=analyst/);
});

test("filters by creation date, both days included", async ({ page }) => {
  await openAccounts(page);

  await from(page).fill("2026-02-01");
  await to(page).fill("2026-02-15");

  await expectListed(page, ["ari", "bea"]);
});

test("combines text, date range and role", async ({ page }) => {
  await openAccounts(page);

  await search(page).fill("a");
  await from(page).fill("2026-01-10");
  await to(page).fill("2026-02-12");
  await roleFilter(page).selectOption("analyst");

  await expectListed(page, ["andres", "ari"]);
  await expect(page).toHaveURL(/q=a/);
  await expect(page).toHaveURL(/from=2026-01-10/);
  await expect(page).toHaveURL(/to=2026-02-12/);

  await page.reload();
  await expectListed(page, ["andres", "ari"]);
  await expect(search(page)).toHaveValue("a");
  await expect(roleFilter(page)).toHaveValue("analyst");
});

test("a shared link opens the same filtered view, even before signing in", async ({ page }) => {
  await openAccounts(page, "?role=analyst&from=2026-02-01");

  await expect(page).toHaveURL(/\/admin\/accounts\?role=analyst&from=2026-02-01/);
  await expectListed(page, ["ari", "ben"]);
  await expect(from(page)).toHaveValue("2026-02-01");
});

test("loads more pages of a filtered list", async ({ page }) => {
  await reset([
    ...Array.from({ length: 55 }, (_, index): SeedAccount => ({ username: `person-${index + 1}`, role: "user" })),
    { username: "zoe", role: "analyst" },
  ]);
  await openAccounts(page, "?role=user");

  await expect(page.getByTestId("account-row")).toHaveCount(50);
  await expect(page.getByTestId("accounts-count")).toHaveText("50 matching accounts loaded");
  await page.getByRole("button", { name: "Load more" }).click();

  await expect(page.getByTestId("account-row")).toHaveCount(55);
  await expect(page.getByTestId("accounts-count")).toHaveText("55 matching accounts");
});

test("says when nothing matches, and clears the filters", async ({ page }) => {
  await openAccounts(page);

  await search(page).fill("nobody-has-this");
  await roleFilter(page).selectOption("admin");

  await expect(page.getByTestId("accounts-empty")).toContainText("No accounts match these filters.");
  await page.getByTestId("accounts-empty").getByRole("button", { name: "Clear filters" }).click();

  await expect(page.getByTestId("account-row")).toHaveCount(people.length + 1);
  await expect(search(page)).toHaveValue("");
  await expect(roleFilter(page)).toHaveValue("");
  await expect(page).toHaveURL(/\/admin\/accounts$/);
});

test("flags a range that ends before it starts, without asking the API", async ({ page }) => {
  await openAccounts(page);

  await from(page).fill("2026-03-01");
  await to(page).fill("2026-02-01");

  await expect(page.getByRole("search").getByRole("alert")).toHaveText("The end date is before the start date.");
  await expect(page.getByTestId("accounts-empty")).toHaveText("Fix the date range to see accounts.");
  await expect(to(page)).toHaveAttribute("aria-invalid", "true");
});
