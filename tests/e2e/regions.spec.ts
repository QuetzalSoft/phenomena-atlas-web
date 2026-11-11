import { expect, test, type Page } from "@playwright/test";
import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import type { SaveFailure } from "./mock-api";

type RegionPartition = components["schemas"]["RegionPartition"];

const mockApiUrl = "http://localhost:8100";

async function mock(path: string, body: unknown = {}) {
  const response = await fetch(`${mockApiUrl}/__mock/${path}`, { method: "POST", body: JSON.stringify(body) });
  expect(response.ok).toBe(true);
}

async function currentPartition(): Promise<RegionPartition> {
  return (await (await fetch(`${mockApiUrl}/region-partition`)).json()) as RegionPartition;
}

async function logInAtKeycloak(page: Page, username: string, password = username) {
  await expect(page).toHaveURL(/\/realms\/phenomena-atlas\/protocol\/openid-connect\/auth/);
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

/** Opens the editor as the admin and waits until the regions are on the map. */
async function openEditor(page: Page) {
  await page.goto("/admin/regions");
  await logInAtKeycloak(page, "admin");
  await expect(page).toHaveURL("/admin/regions");
  await waitForRegions(page);
}

async function waitForRegions(page: Page) {
  await page.waitForFunction(() => {
    const map = window.__atlasMap;
    return !!map && map.loaded() && map.queryRenderedFeatures({ layers: ["regions-fill"] }).length > 0;
  });
}

/** Clicks the map at a longitude and latitude. */
async function clickMap(page: Page, lng: number, lat: number) {
  const point = await page.evaluate(([x, y]) => window.__atlasMap!.project([x!, y!]), [lng, lat]);
  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  await page.mouse.click(canvas!.x + point.x, canvas!.y + point.y);
}

const panel = (page: Page) => page.getByRole("complementary", { name: "Region editor" });
const selected = (page: Page) => page.getByTestId("selected-region");
const pending = (page: Page) => page.getByTestId("pending-changes");
const message = (page: Page) => page.getByTestId("region-message");

// The mock's regions: Guadalajara is the box from 103.4° W to 103.3° W, 20.6° N to 20.7° N,
// with Centro its west half and Oblatos its east half. Zapopan, one region, is west of it.
const centro = [-103.375, 20.65] as const;
const oblatos = [-103.325, 20.65] as const;

test.beforeEach(async () => {
  await mock("reset");
});

test("a user is told the page needs the admin role", async ({ page }) => {
  await page.goto("/admin/regions");
  await logInAtKeycloak(page, "dev");

  await expect(page.getByTestId("admin-required")).toContainText("This page needs the admin role");
  await expect(page.getByTestId("region-map")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Regions" })).toHaveCount(0);
});

test("an admin selects a region on the map and finds one by name", async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Regions" })).toHaveAttribute("aria-current", "page");
  await expect(panel(page)).toContainText("Version 1");
  await expect(panel(page)).toContainText("3 regions in 2 municipalities");

  await clickMap(page, ...centro);
  await expect(selected(page).getByRole("heading")).toHaveText("Centro");
  await expect(page.getByTestId("selected-region-id")).toContainText("1");
  await expect(selected(page)).toContainText("Guadalajara");

  await panel(page).getByLabel("Find a region").fill("zapopan");
  await panel(page).getByRole("button", { name: /Zapopan centro/ }).click();
  await expect(selected(page).getByRole("heading")).toHaveText("Zapopan centro");
});

test("an admin splits a region and saves the new version", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...centro);
  await selected(page).getByRole("button", { name: "Split" }).click();

  // A line across Centro from north to south, a quarter of the way in, past both edges.
  await clickMap(page, -103.3875, 20.71);
  await clickMap(page, -103.3875, 20.59);
  await page.getByRole("toolbar", { name: "Drawing" }).getByRole("button", { name: "Finish" }).click();

  const form = selected(page);
  await expect(form.getByLabel("New region name")).toHaveValue("Centro 2");
  // Population is split by area: about three quarters stay, one quarter goes. Clicks land
  // on whole pixels, so the line is not exactly where it was aimed.
  const kept = Number(await form.getByLabel("Population of Centro").inputValue());
  expect(kept).toBeGreaterThan(735);
  expect(kept).toBeLessThan(765);
  await expect(form.getByLabel("Population of the new region")).toHaveValue(String(1000 - kept));
  await form.getByLabel("New region name").fill("Centro poniente");
  await form.getByLabel("Population of the new region").fill("300");
  await form.getByRole("button", { name: "Apply split" }).click();

  await expect(pending(page).getByRole("listitem")).toHaveText([/Centro\s*changed/, /Centro poniente\s*new/]);
  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Saved as version 2.");
  await expect(pending(page)).toContainText("None.");

  const saved = await currentPartition();
  expect(saved.version).toBe(2);
  const created = saved.features.find((region) => region.properties.name === "Centro poniente");
  expect(created?.id).toBe(4);
  expect(created?.properties.population).toBe(300);
  expect(saved.features.find((region) => region.id === 1)?.properties.population).toBe(kept);

  // The new region is on the map after a reload, with its id.
  await page.reload();
  await waitForRegions(page);
  await clickMap(page, -103.395, 20.65);
  await expect(selected(page).getByRole("heading")).toHaveText("Centro poniente");
  await expect(page.getByTestId("selected-region-id")).toContainText("4");
});

test("a line that does not cross the region is refused", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...centro);
  await selected(page).getByRole("button", { name: "Split" }).click();
  await clickMap(page, -103.39, 20.65);
  await clickMap(page, -103.38, 20.66);
  await page.keyboard.press("Enter");

  await expect(message(page)).toHaveText("The line has to cross the region from one side to the other.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "Drawing" })).toHaveCount(0);
});

test("an admin merges a neighbour and its population adds up", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...centro);
  await selected(page).getByRole("button", { name: "Merge a neighbour" }).click();
  await clickMap(page, ...oblatos);

  await expect(message(page)).toContainText("Oblatos was merged into Centro");
  await expect(selected(page).getByLabel("Population")).toHaveValue("1600");
  await expect(pending(page).getByRole("listitem")).toHaveText([/Centro\s*changed/, /Region 2\s*retired/]);

  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Saved as version 2.");
  expect((await currentPartition()).features.map((region) => region.id)).toEqual([1, 3]);
});

test("regions in different municipalities cannot be merged", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...centro);
  await selected(page).getByRole("button", { name: "Merge a neighbour" }).click();
  await clickMap(page, -103.45, 20.65);

  await expect(message(page)).toHaveText("Regions in different municipalities cannot be merged.");
  await expect(pending(page)).toContainText("None.");
});

test("an admin gives a drawn area to a region", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...oblatos);
  await selected(page).getByRole("button", { name: "Reassign area" }).click();
  // A square that reaches into Centro, and out of Guadalajara into Zapopan, which is ignored.
  for (const [lng, lat] of [
    [-103.42, 20.63],
    [-103.34, 20.63],
    [-103.34, 20.67],
    [-103.42, 20.67],
  ] as const) {
    await clickMap(page, lng, lat);
  }
  await page.getByRole("toolbar", { name: "Drawing" }).getByRole("button", { name: "Finish" }).click();

  await expect(message(page)).toContainText("Oblatos took land from 1 region");
  await expect(pending(page).getByRole("listitem")).toHaveText([/Oblatos\s*changed/, /Centro\s*changed/]);
  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Saved as version 2.");

  // Zapopan kept its land.
  const saved = await currentPartition();
  expect(saved.features.find((region) => region.id === 3)?.geometry.coordinates).toEqual([
    [[[-103.5, 20.6], [-103.4, 20.6], [-103.4, 20.7], [-103.5, 20.7], [-103.5, 20.6]]],
  ]);
});

test("an admin renames a region and sets its population", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...oblatos);
  await selected(page).getByLabel("Name").fill("Oblatos norte");
  await selected(page).getByLabel("Population").fill("650");
  await expect(selected(page).getByRole("heading")).toHaveText("Oblatos norte");

  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Saved as version 2.");
  expect((await currentPartition()).features.find((region) => region.id === 2)?.properties).toEqual({
    name: "Oblatos norte",
    population: 650,
    municipalityCode: "14039",
  });
});

test("a region without a name cannot be saved, and discard undoes every change", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...oblatos);
  await selected(page).getByLabel("Name").fill("");

  await expect(pending(page)).toContainText("Every region needs a name.");
  await expect(pending(page).getByRole("button", { name: "Save version" })).toBeDisabled();

  await pending(page).getByRole("button", { name: "Discard" }).click();
  await expect(selected(page).getByLabel("Name")).toHaveValue("Oblatos");
  await expect(pending(page)).toContainText("None.");
});

test("a save based on an old version offers the latest one", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...oblatos);
  await selected(page).getByLabel("Population").fill("700");
  await mock("save-as-someone-else");

  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toContainText("Someone saved a newer version while you were editing.");
  await message(page).getByRole("button", { name: "Load the latest version" }).click();

  await expect(pending(page)).toContainText("None.");
  await expect(selected(page).getByLabel("Population")).toHaveValue("600");
  await selected(page).getByRole("button", { name: "Close" }).click();
  await expect(panel(page)).toContainText("Version 2");
});

test("a refused save says why and keeps the changes", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...oblatos);
  await selected(page).getByLabel("Population").fill("700");
  const failure: SaveFailure = { status: 400, code: "region_overlap", details: { regionIds: [1, 2] } };
  await mock("save-failure", failure);

  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Two regions overlap. The overlap is shown in red.");
  await expect(pending(page).getByRole("listitem")).toHaveText([/Oblatos\s*changed/]);

  // Saving again works once the API accepts it.
  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Saved as version 2.");
});

test("the history shows each version and what it changed", async ({ page }) => {
  await openEditor(page);
  await clickMap(page, ...centro);
  await selected(page).getByRole("button", { name: "Merge a neighbour" }).click();
  await clickMap(page, ...oblatos);
  await pending(page).getByRole("button", { name: "Save version" }).click();
  await expect(message(page)).toHaveText("Saved as version 2.");

  await panel(page).getByRole("link", { name: "Version history" }).click();
  await expect(page).toHaveURL("/admin/regions/history");
  const versions = page.getByRole("complementary", { name: "Versions" });
  await expect(versions.getByRole("link", { name: /Version/ })).toHaveText([/Version 2.*Admin User/, /Version 1.*the initial load/]);
  await expect(page.getByTestId("version-summary")).toContainText("0 regions added, 1 changed, 1 retired.");
  await expect(page.getByTestId("version-summary")).toContainText("Retired: 2");

  await versions.getByRole("link", { name: /Version 1/ }).click();
  await expect(page).toHaveURL("/admin/regions/history?version=1");
  await expect(page.getByTestId("version-summary")).toContainText("3 regions added, 0 changed, 0 retired.");
  // Version 1 had three regions; a feature can be drawn in several tiles, so count keys.
  await page.waitForFunction(() => {
    const map = window.__atlasMap;
    return !!map && map.loaded() && new Set(map.queryRenderedFeatures({ layers: ["regions-fill"] }).map((feature) => feature.properties.key)).size === 3;
  });
});
