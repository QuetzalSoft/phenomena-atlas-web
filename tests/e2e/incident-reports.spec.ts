import { expect, test, type Page } from "@playwright/test";
import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import type { ReportFailure } from "./mock-api";

type Phenomenon = components["schemas"]["Phenomenon"];
type Definition = components["schemas"]["PhenomenonDefinition"];
type Characteristic = components["schemas"]["Characteristic"];

const mockApiUrl = "http://localhost:8100";

async function mock<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${mockApiUrl}/__mock/${path}`, { method: "POST", body: JSON.stringify(body) });
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

async function seed(...items: (Definition & { status?: Phenomenon["status"] })[]): Promise<Phenomenon[]> {
  return (await mock<{ items: Phenomenon[] }>("phenomena", { items })).items;
}

async function signIn(page: Page, path: string, username = "dev") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/realms\/phenomena-atlas\/protocol\/openid-connect\/auth/);
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(username);
  await page.locator("#kc-login").click();
  await expect(page).toHaveURL(path);
}

const victims: Characteristic = { type: "number", key: "victims", label: "Victims", description: "People directly affected.", required: true, retired: false, integer: true, minimum: 1, unit: "people" };
const severity: Characteristic = {
  type: "category",
  key: "severity",
  label: "Severity",
  required: true,
  retired: false,
  options: [
    { key: "low", label: "Low", weight: 1, retired: false },
    { key: "unclear", label: "Unclear", weight: 0, retired: true },
    { key: "high", label: "High", weight: 3, retired: false },
  ],
};
const weapon: Characteristic = { type: "boolean", key: "weapon", label: "Weapon involved", required: false, retired: false };
const witness: Characteristic = { type: "text", key: "witness", label: "Witness name", required: false, retired: true, maxLength: 100 };

const genderViolence: Definition & { status: Phenomenon["status"] } = {
  name: "Gender violence",
  description: "Violence against a person because of their gender.",
  characteristics: [victims, severity, weapon, witness],
  weightingFunction: { kind: "aggregate", function: "count" },
  status: "published",
};

const phenomenonSelect = (page: Page) => page.getByTestId("phenomenon-select");
const regionSelect = (page: Page) => page.getByTestId("region-select");
const fileButton = (page: Page) => page.getByRole("button", { name: "File report" });

/** The page never scrolls sideways: everything fits the viewport. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Searches the region list and picks the first match, which must be `name`. */
async function chooseRegion(page: Page, search: string, name: string) {
  await regionSelect(page).getByRole("button").click();
  await page.getByRole("combobox", { name: "Search regions by name" }).fill(search);
  await expect(page.getByRole("listbox").getByRole("option").first()).toHaveText(new RegExp(`^${name}`));
  await page.keyboard.press("Enter");
  await expect(regionSelect(page).getByRole("button")).toHaveText(new RegExp(`^${name} ·`));
}

test.beforeEach(async () => {
  await mock("reset");
});

test("sends anonymous visitors to sign in, then back to the form", async ({ page }) => {
  await seed(genderViolence);
  await signIn(page, "/reports/new");
  await expect(page.getByRole("heading", { name: "File a report" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "File a report" })).toHaveAttribute("aria-current", "page");
});

test("offers only published phenomena, and only the active parts of their definition", async ({ page }) => {
  await seed(genderViolence, { ...genderViolence, name: "Still a draft", status: "draft" }, { ...genderViolence, name: "Archived one", status: "archived" });
  await signIn(page, "/reports/new");

  await expect(phenomenonSelect(page).locator("option")).toHaveText(["Choose a phenomenon", "Gender violence"]);
  await phenomenonSelect(page).selectOption({ label: "Gender violence" });
  await expect(page).toHaveURL(/\?phenomenon=\d+$/);

  const fields = page.getByTestId("characteristic-fields");
  await expect(fields.getByLabel("Victims")).toBeVisible();
  await expect(fields.getByText("Witness name")).toHaveCount(0);
  await expect(fields.getByLabel("Severity").locator("option")).toHaveText(["Choose one", "Low", "High"]);
  await expect(fields.getByRole("group", { name: "Weapon involved (optional)" }).getByRole("radio")).toHaveCount(3);
});

test("files a report about a region chosen by name, and lists it among the person's reports", async ({ page }) => {
  const [phenomenon] = await seed(genderViolence);
  await signIn(page, `/reports/new?phenomenon=${phenomenon!.id}`);

  // Trying to file an empty form points at every missing answer.
  await page.getByLabel("Day it happened").fill("");
  await fileButton(page).click();
  await expect(page.getByText("Choose the region where it happened.")).toBeVisible();
  await expect(page.getByText("Enter the day it happened.")).toBeVisible();
  await expect(page.getByText("4 things need fixing before filing.")).toBeVisible();
  await expect(page.getByLabel("Description (optional)")).not.toHaveAttribute("aria-invalid");
  await expect(fileButton(page)).toBeDisabled();

  // The search narrows the regions, ignoring case, and matches the municipality too.
  await regionSelect(page).getByRole("button").click();
  await page.getByRole("combobox", { name: "Search regions by name" }).fill("centro");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["CentroGuadalajara", "Zapopan centroZapopan"]);
  await page.getByRole("combobox", { name: "Search regions by name" }).fill("centro zapopan");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Zapopan centroZapopan"]);
  await page.keyboard.press("Escape");
  await chooseRegion(page, "OBLA", "Oblatos");
  await expect(page.getByTestId("region-preview")).toContainText("Showing Oblatos.");
  // The map centres the chosen region (-103.35..-103.3 in the mock), whether or not it had loaded when it was chosen.
  await page.waitForFunction(() => {
    const map = window.__atlasMap;
    return !!map && map.loaded() && !map.isMoving() && Math.abs(map.getCenter().lng + 103.325) < 0.005;
  });

  await page.getByLabel("Day it happened").fill("2026-11-02");
  await page.getByLabel("Description").fill("Shouting and a fight outside a bar.");
  await page.getByLabel("Victims").fill("2");
  await page.getByLabel("Severity").selectOption({ label: "High" });
  await page.getByRole("radio", { name: "Yes" }).check();
  await expect(page.getByText("Once filed, a report cannot be edited or withdrawn.")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/report-form-desktop.png", fullPage: true });
  await fileButton(page).click();

  const filed = page.getByTestId("report-filed");
  await expect(filed.getByRole("heading", { name: "Report filed" })).toBeVisible();
  const card = filed.getByTestId("report");
  await expect(card).toContainText("Oblatos · November 2, 2026");
  await expect(card).toContainText("Shouting and a fight outside a bar.");
  await expect(card.locator("dl")).toContainText("Victims2 people");
  await expect(card.locator("dl")).toContainText("SeverityHigh");
  await expect(card.locator("dl")).toContainText("Weapon involvedYes");
  await page.screenshot({ path: "test-results/screens/report-filed-desktop.png", fullPage: true });

  await filed.getByRole("link", { name: "See my reports" }).click();
  await expect(page).toHaveURL("/reports/mine");
  const reports = page.getByTestId("my-reports").getByTestId("report");
  await expect(reports).toHaveCount(1);
  await expect(reports.first()).toContainText("Gender violence");
  await expect(reports.first()).toContainText("SeverityHigh");
  await page.screenshot({ path: "test-results/screens/my-reports-desktop.png", fullPage: true });
});

test("shows the API's refusal next to the field it points at", async ({ page }) => {
  const [phenomenon] = await seed(genderViolence);
  await signIn(page, `/reports/new?phenomenon=${phenomenon!.id}`);
  await chooseRegion(page, "centro", "Centro");
  await page.getByLabel("Description").fill("Something happened.");
  await page.getByLabel("Victims").fill("1");
  await page.getByLabel("Severity").selectOption({ label: "Low" });

  const failure: ReportFailure = { status: 400, code: "region_not_found", details: { path: "/regionId" } };
  await mock("report-failure", failure);
  await fileButton(page).click();
  const copy = "That region is no longer part of the map. Choose the region again.";
  await expect(page.getByTestId("report-message")).toHaveText(copy);
  await expect(regionSelect(page).getByRole("button")).toHaveAccessibleDescription(copy);

  // Changing anything clears the refusal, and filing again works.
  await chooseRegion(page, "zapopan", "Zapopan centro");
  await expect(page.getByTestId("report-message")).toHaveCount(0);
  await fileButton(page).click();
  await expect(page.getByTestId("report-filed")).toBeVisible();
});

test("closes the region list with Escape and when focus leaves it", async ({ page }) => {
  const [phenomenon] = await seed(genderViolence);
  await signIn(page, `/reports/new?phenomenon=${phenomenon!.id}`);
  const trigger = regionSelect(page).getByRole("button");

  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByLabel("Description").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await trigger.click();
  await page.getByRole("combobox", { name: "Search regions by name" }).fill("nowhere");
  await expect(page.getByText('Nothing matches "nowhere".')).toBeVisible();
});

test("filters the person's reports by phenomenon", async ({ page }) => {
  const [violence, water] = await seed(genderViolence, {
    name: "Contaminated water",
    description: "Water that is not safe to drink.",
    characteristics: [],
    weightingFunction: { kind: "aggregate", function: "count" },
    status: "published",
  });
  await signIn(page, `/reports/new?phenomenon=${water!.id}`);
  // The description is optional: this report is filed with none.
  await chooseRegion(page, "centro", "Centro");
  await fileButton(page).click();
  await expect(page.getByTestId("report-filed")).toBeVisible();
  await expect(page.getByTestId("report-filed").getByTestId("report").locator("p")).toHaveCount(0);

  await page.goto("/reports/mine");
  await expect(page.getByTestId("report")).toHaveCount(1);
  await page.getByLabel("Phenomenon").selectOption({ label: violence!.name });
  await expect(page).toHaveURL(`/reports/mine?phenomenon=${violence!.id}`);
  await expect(page.getByText("You have not filed any reports about this phenomenon.")).toBeVisible();
  await page.getByLabel("Phenomenon").selectOption({ label: "All phenomena" });
  await expect(page.getByTestId("report")).toHaveCount(1);
});

test("fits a phone screen", async ({ page }) => {
  const [phenomenon] = await seed(genderViolence);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, `/reports/new?phenomenon=${phenomenon!.id}`);
  await expect(page.getByTestId("region-preview")).toBeVisible();
  await page.waitForFunction(() => window.__atlasMap?.loaded() === true);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: "test-results/screens/report-form-phone.png", fullPage: true });

  await regionSelect(page).getByRole("button").click();
  await page.screenshot({ path: "test-results/screens/region-list-phone.png" });
  await page.keyboard.press("Escape");

  await page.goto("/reports/mine");
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: "test-results/screens/my-reports-empty-phone.png", fullPage: true });
});
