import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { describe, expect, it } from "vitest";
import { bodyOf, displayValue, findIssues, type ReportDraft, today } from "./report-draft";

type Characteristic = components["schemas"]["Characteristic"];

const victims: Characteristic = { type: "number", key: "victims", label: "Victims", required: true, retired: false, integer: true, minimum: 1, maximum: 9, unit: "people" };
const weapon: Characteristic = { type: "boolean", key: "weapon", label: "Weapon", required: false, retired: false };
const severity: Characteristic = {
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
const place: Characteristic = { type: "text", key: "place", label: "Place", required: false, retired: false, maxLength: 100 };
const old: Characteristic = { type: "boolean", key: "old", label: "Old", required: true, retired: true };
const characteristics = [victims, weapon, severity, place, old];

const draft = (overrides: Partial<ReportDraft> = {}): ReportDraft => ({
  regionId: 1,
  occurredOn: "2026-11-10",
  description: "Something happened.",
  values: { victims: 2, severity: "high" },
  ...overrides,
});

describe("today", () => {
  it("is the date in the metropolitan area, not in UTC", () => {
    // 03:00 UTC on the 17th is still the 16th in Guadalajara.
    expect(today(new Date("2026-11-17T03:00:00Z"))).toBe("2026-11-16");
  });
});

describe("findIssues", () => {
  const issuesOf = (overrides: Partial<ReportDraft>) => Object.fromEntries(findIssues(draft(overrides), characteristics, "2026-11-16"));

  it("finds nothing in a complete draft, and never asks for a retired characteristic", () => {
    expect(issuesOf({})).toEqual({});
  });

  it("asks for the region and the day, but not for a description", () => {
    expect(Object.keys(issuesOf({ regionId: undefined, occurredOn: "", description: "  " }))).toEqual(["/regionId", "/occurredOn"]);
  });

  it("refuses a day after today", () => {
    expect(issuesOf({ occurredOn: "2026-11-17" })).toEqual({ "/occurredOn": "The day cannot be after today." });
  });

  it("asks for required values, and points at each by its key", () => {
    expect(issuesOf({ values: {} })).toEqual({ "/values/victims": "This one is required.", "/values/severity": "Choose an answer." });
  });

  it("checks numbers against the characteristic's settings", () => {
    expect(issuesOf({ values: { victims: 1.5, severity: "low" } })).toEqual({ "/values/victims": "Enter a whole number." });
    expect(issuesOf({ values: { victims: 0, severity: "low" } })).toEqual({ "/values/victims": "Enter 1 or more." });
    expect(issuesOf({ values: { victims: 10, severity: "low" } })).toEqual({ "/values/victims": "Enter 9 or less." });
    expect(issuesOf({ values: { victims: Number.NaN, severity: "low" } })).toEqual({ "/values/victims": "Enter a number." });
  });

  it("lets optional values stay empty, but not blank", () => {
    expect(issuesOf({ values: { victims: 2, severity: "low", place: "" } })).toEqual({});
    expect(issuesOf({ values: { victims: 2, severity: "low", place: "   " } })).toEqual({ "/values/place": "Leave it empty or write something." });
  });
});

describe("bodyOf", () => {
  it("sends only the values given, trimmed, and nothing for retired characteristics", () => {
    const body = bodyOf(draft({ description: "  Near the market. ", values: { victims: 2, severity: "high", weapon: false, place: " Park ", old: true } }), characteristics);
    expect(body).toEqual({
      regionId: 1,
      occurredOn: "2026-11-10",
      description: "Near the market.",
      values: { victims: 2, severity: "high", weapon: false, place: "Park" },
    });
  });

  it("leaves out a blank description", () => {
    expect(bodyOf(draft({ description: "   " }), characteristics)).not.toHaveProperty("description");
  });
});

describe("displayValue", () => {
  it("shows labels, yes or no, and units", () => {
    expect(displayValue(severity, "high")).toBe("High");
    expect(displayValue(weapon, true)).toBe("Yes");
    expect(displayValue(victims, 3)).toBe("3 people");
    expect(displayValue(undefined, "raw")).toBe("raw");
  });
});
