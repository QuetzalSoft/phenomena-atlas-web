import { expect, test, type Page } from "@playwright/test";
import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import type { PhenomenonFailure } from "./mock-api";

type Phenomenon = components["schemas"]["Phenomenon"];
type Definition = components["schemas"]["PhenomenonDefinition"];

const mockApiUrl = "http://localhost:8100";

async function mock<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${mockApiUrl}/__mock/${path}`, { method: "POST", body: JSON.stringify(body) });
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

async function seed(...items: (Definition & { status?: Phenomenon["status"] })[]): Promise<Phenomenon[]> {
  return (await mock<{ items: Phenomenon[] }>("phenomena", { items })).items;
}

async function stored(id: number): Promise<Phenomenon> {
  // The admin's view: the mock shows drafts only to admins, so read through the list as one would.
  const all = (await (await fetch(`${mockApiUrl}/phenomena`)).json()) as { items: Phenomenon[] };
  const published = all.items.find((item) => item.id === id);
  if (published) return published;
  throw new Error(`Phenomenon ${id} is not published.`);
}

async function signIn(page: Page, path: string, username = "admin") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/realms\/phenomena-atlas\/protocol\/openid-connect\/auth/);
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(username);
  await page.locator("#kc-login").click();
  await expect(page).toHaveURL(path);
}

const severity: components["schemas"]["Characteristic"] = {
  type: "category",
  key: "severity",
  label: "Severity",
  required: true,
  retired: false,
  options: [
    { key: "low", label: "Low", weight: 1, retired: false },
    { key: "high", label: "High", weight: 3, retired: false },
  ],
};

/** sum(severity) / population * 1000 */
const perThousand: components["schemas"]["WeightingExpression"] = {
  kind: "operation",
  operator: "multiply",
  left: { kind: "operation", operator: "divide", left: { kind: "aggregate", function: "sum", characteristicKey: "severity" }, right: { kind: "population" } },
  right: { kind: "number", value: 1000 },
};

const details = (page: Page) => page.getByRole("region", { name: "Details" });
const formula = (page: Page) => page.getByTestId("formula");
const saveBar = (page: Page) => page.getByTestId("save-bar");
const message = (page: Page) => page.getByTestId("phenomenon-message");
const characteristic = (page: Page, key: string) => page.locator(`[data-testid="characteristic"][data-key="${key}"]`);

test.beforeEach(async () => {
  await mock("reset");
});

test("a user is told the page needs the admin role", async ({ page }) => {
  await signIn(page, "/admin/phenomena", "dev");
  await expect(page.getByTestId("admin-required")).toContainText("Only admins can define phenomena");
  await expect(page.getByRole("link", { name: "Phenomena", exact: true })).toHaveCount(0);
});

test("an admin creates a draft and lands on its editor", async ({ page }) => {
  await seed({ name: "Contaminated water", description: "", characteristics: [], weightingFunction: { kind: "population" }, status: "published" });
  await signIn(page, "/admin/phenomena");

  await expect(page.getByTestId("phenomenon-row")).toHaveCount(1);
  await expect(page.getByTestId("phenomenon-row")).toContainText("Published");

  await page.getByLabel("Name").fill("Gender violence");
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/admin\/phenomena\/2$/);
  await expect(page.getByTestId("phenomenon-name")).toHaveText("Gender violence");
  await expect(page.getByTestId("phenomenon-status")).toHaveText("Draft");
  await expect(formula(page)).toHaveAttribute("aria-label", "Index = ?");
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await expect(page.getByText("Fill in every part of the weighting function to publish.")).toBeVisible();
});

test("an admin defines characteristics, builds the function, saves and publishes", async ({ page }) => {
  const [draft] = await seed({ name: "Gender violence", description: "", characteristics: [], weightingFunction: { kind: "blank" } });
  await signIn(page, `/admin/phenomena/${draft!.id}`);

  // A number, a category with weights, and a yes/no.
  await page.getByTestId("add-characteristic").click();
  const first = page.getByTestId("characteristic").nth(0);
  await first.getByLabel("Label").fill("Number of victims");
  await expect(first.getByLabel("Key")).toHaveValue("number_of_victims");
  await first.getByLabel("Whole numbers only").check();
  await first.getByLabel("Minimum").fill("0");

  await page.getByTestId("add-characteristic").click();
  const second = page.getByTestId("characteristic").nth(1);
  await second.getByLabel("Label").fill("Severity");
  await second.getByLabel("Type").selectOption("category");
  await second.getByLabel("Label of option 1").fill("Low");
  await second.getByRole("button", { name: "Add option" }).click();
  await second.getByLabel("Label of option 2").fill("High");
  await second.getByLabel("Weight of High").fill("3");

  await page.getByTestId("add-characteristic").click();
  const third = page.getByTestId("characteristic").nth(2);
  await third.getByLabel("Label").fill("Weapon involved");
  await third.getByLabel("Type").selectOption("boolean");

  // Severity per thousand inhabitants.
  await page.getByLabel("Fill the function").selectOption("operation:multiply");
  await page.getByLabel("Fill part 1", { exact: true }).selectOption("operation:divide");
  await page.getByLabel("Fill part 1.1").selectOption("aggregate:sum");
  await page.getByLabel("Characteristic of part 1.1").selectOption("severity");
  await page.getByLabel("Fill part 1.2").selectOption("value:population");
  await page.getByLabel("Fill part 2", { exact: true }).selectOption("value:number");
  await page.getByLabel("Number in part 2").fill("1000");
  await expect(formula(page)).toHaveAttribute("aria-label", "Index = Sum of Severity ÷ Population × 1000");

  await saveBar(page).getByRole("button", { name: "Save" }).click();
  await expect(message(page)).toHaveText("Saved.");

  await page.reload();
  await expect(formula(page)).toHaveAttribute("aria-label", "Index = Sum of Severity ÷ Population × 1000");
  await expect(page.getByTestId("characteristic")).toHaveCount(3);
  await expect(characteristic(page, "severity").getByLabel("Weight of High")).toHaveValue("3");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("phenomenon-status")).toHaveText("Published");
  expect((await stored(draft!.id)).weightingFunction).toEqual(perThousand);
});

test("an empty field is pointed out when saving, not while typing", async ({ page }) => {
  const [draft] = await seed({ name: "Gender violence", description: "", characteristics: [], weightingFunction: { kind: "blank" } });
  await signIn(page, `/admin/phenomena/${draft!.id}`);

  await page.getByTestId("add-characteristic").click();
  await expect(page.getByText("Give the characteristic a label.")).toHaveCount(0);

  await saveBar(page).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Give the characteristic a label.")).toBeVisible();
  await expect(saveBar(page)).toContainText("One thing needs fixing before saving.");
  await expect(saveBar(page).getByRole("button", { name: "Save" })).toBeDisabled();

  await page.getByTestId("characteristic").getByLabel("Label").fill("Victims");
  await saveBar(page).getByRole("button", { name: "Save" }).click();
  await expect(message(page)).toHaveText("Saved.");
});

test("a saved characteristic keeps its key and type and is retired, not removed", async ({ page }) => {
  const [published] = await seed({ name: "Gender violence", description: "", characteristics: [severity], weightingFunction: perThousand, status: "published" });
  await signIn(page, `/admin/phenomena/${published!.id}`);

  const row = characteristic(page, "severity");
  await expect(row.getByLabel("Key")).toBeDisabled();
  await expect(row.getByLabel("Type")).toBeDisabled();
  await expect(row.getByRole("button", { name: "Remove Severity" })).toHaveCount(0);

  // The function uses it, so retiring it is pointed out before saving.
  await row.getByRole("button", { name: "Retire" }).first().click();
  await expect(row).toContainText("Retired");
  await expect(page.getByText("Severity is retired. Choose another characteristic.")).toBeVisible();
  await expect(saveBar(page).getByRole("button", { name: "Save" })).toBeDisabled();

  await saveBar(page).getByRole("button", { name: "Discard" }).click();
  await expect(row).not.toContainText("Retired");
  await expect(saveBar(page)).toHaveCount(0);
});

test("a published function cannot be saved with a part missing", async ({ page }) => {
  const [published] = await seed({ name: "Gender violence", description: "", characteristics: [severity], weightingFunction: perThousand, status: "published" });
  await signIn(page, `/admin/phenomena/${published!.id}`);

  await page.getByRole("button", { name: "Clear part 2" }).click();
  await expect(formula(page)).toHaveAttribute("aria-label", "Index = Sum of Severity ÷ Population × ?");
  await expect(page.getByText("Fill in this part. A published phenomenon needs a complete function.")).toBeVisible();
  await expect(saveBar(page).getByRole("button", { name: "Save" })).toBeDisabled();

  // Combining a block wraps it in a new operation whose other side is empty.
  await page.getByLabel("Fill part 2", { exact: true }).selectOption("value:number");
  await page.getByLabel("Combine part 1.2 with an operation").selectOption("add");
  await page.getByLabel("Fill part 1.2.2").selectOption("value:number");
  await expect(formula(page)).toHaveAttribute("aria-label", "Index = Sum of Severity ÷ (Population + 1) × 1");
  await expect(saveBar(page).getByRole("button", { name: "Save" })).toBeEnabled();
});

test("a save based on an old revision offers the latest one", async ({ page }) => {
  const [draft] = await seed({ name: "Gender violence", description: "", characteristics: [], weightingFunction: { kind: "blank" } });
  await signIn(page, `/admin/phenomena/${draft!.id}`);

  await mock("phenomenon-saved-elsewhere", { id: draft!.id });
  await details(page).getByLabel("Name").fill("Violence");
  await saveBar(page).getByRole("button", { name: "Save" }).click();
  await expect(message(page)).toContainText("Another admin changed this phenomenon");

  await message(page).getByRole("button", { name: "Load their version" }).click();
  await expect(page.getByTestId("phenomenon-name")).toHaveText("Gender violence (edited elsewhere)");
  await expect(details(page).getByLabel("Name")).toHaveValue("Gender violence (edited elsewhere)");
});

test("a refused save says why and points at the part at fault", async ({ page }) => {
  const [draft] = await seed({ name: "Gender violence", description: "", characteristics: [severity], weightingFunction: perThousand });
  await signIn(page, `/admin/phenomena/${draft!.id}`);

  const failure: PhenomenonFailure = { status: 400, code: "characteristic_retired", details: { path: "/weightingFunction/left/left/characteristicKey", key: "severity" } };
  await mock("phenomenon-failure", failure);
  await details(page).getByLabel("Description").fill("Reports of gender violence.");
  await saveBar(page).getByRole("button", { name: "Save" }).click();

  await expect(message(page)).toHaveText("The weighting function uses a retired characteristic.");
  await expect(page.locator('[data-path="/weightingFunction/left/left"]')).toHaveAttribute("data-problem", "true");
  // The changes stay, to be fixed and saved again.
  await expect(details(page).getByLabel("Description")).toHaveValue("Reports of gender violence.");
});

test("an admin deletes a draft after confirming", async ({ page }) => {
  const [draft] = await seed({ name: "Mistake", description: "", characteristics: [], weightingFunction: { kind: "blank" } });
  await signIn(page, `/admin/phenomena/${draft!.id}`);

  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("group", { name: "Delete this draft" }).getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("group", { name: "Delete this draft" }).getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL("/admin/phenomena");
  await expect(page.getByText("No phenomena yet.")).toBeVisible();
});

test("the editor fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const [draft] = await seed({ name: "Gender violence", description: "", characteristics: [severity], weightingFunction: perThousand });
  await signIn(page, `/admin/phenomena/${draft!.id}`);

  await expect(formula(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
