import type { components } from "@quetzalsoft/phenomena-atlas-contract";

type Characteristic = components["schemas"]["Characteristic"];
type ReportBody = components["schemas"]["IncidentReportDraft"];

/** What the person has entered for one characteristic so far. NaN is a number field holding text that is not a number yet. */
export type ValueDraft = number | boolean | string | undefined;

/** A report as it is being filled in. */
export interface ReportDraft {
  regionId: number | undefined;
  occurredOn: string;
  description: string;
  values: Record<string, ValueDraft>;
}

/** Incident dates are days in the metropolitan area (ADR 0013 in the system repository). */
const metropolitanTimeZone = "America/Mexico_City";

/** Today in the metropolitan area, as YYYY-MM-DD. */
export function today(now = new Date()): string {
  // The Canadian English format is YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: metropolitanTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function emptyDraft(): ReportDraft {
  return { regionId: undefined, occurredOn: today(), description: "", values: {} };
}

/** The characteristics a new report can carry, in the order the phenomenon lists them. */
export function activeCharacteristics(characteristics: readonly Characteristic[]): Characteristic[] {
  return characteristics.filter((characteristic) => !characteristic.retired);
}

/** Whether a value counts as given. An empty text or an empty number field does not. */
function isGiven(value: ValueDraft): boolean {
  return value !== undefined && value !== "" && !(typeof value === "number" && Number.isNaN(value));
}

/**
 * What stops the draft from being filed, as messages keyed by the JSON Pointer the API uses
 * for the same problem, so one map serves both. A convenience: the API checks it all again.
 */
export function findIssues(draft: ReportDraft, characteristics: readonly Characteristic[], now = today()): Map<string, string> {
  const issues = new Map<string, string>();
  if (draft.regionId === undefined) {
    issues.set("/regionId", "Choose the region where it happened.");
  }
  if (draft.occurredOn === "") {
    issues.set("/occurredOn", "Enter the day it happened.");
  } else if (draft.occurredOn > now) {
    issues.set("/occurredOn", "The day cannot be after today.");
  }
  for (const characteristic of activeCharacteristics(characteristics)) {
    const path = `/values/${characteristic.key}`;
    const value = draft.values[characteristic.key];
    if (!isGiven(value)) {
      if (typeof value === "number") {
        issues.set(path, "Enter a number.");
      } else if (characteristic.required) {
        issues.set(path, characteristic.type === "boolean" || characteristic.type === "category" ? "Choose an answer." : "This one is required.");
      }
      continue;
    }
    if (characteristic.type === "number" && typeof value === "number") {
      if (characteristic.integer && !Number.isInteger(value)) {
        issues.set(path, "Enter a whole number.");
      } else if (characteristic.minimum !== undefined && value < characteristic.minimum) {
        issues.set(path, `Enter ${characteristic.minimum} or more.`);
      } else if (characteristic.maximum !== undefined && value > characteristic.maximum) {
        issues.set(path, `Enter ${characteristic.maximum} or less.`);
      }
    }
    if (characteristic.type === "text" && typeof value === "string" && value.trim() === "") {
      issues.set(path, characteristic.required ? "This one is required." : "Leave it empty or write something.");
    }
  }
  return issues;
}

/** The request body for a draft with no issues. Values not given, and a blank description, are left out. */
export function bodyOf(draft: ReportDraft, characteristics: readonly Characteristic[]): ReportBody {
  const values: ReportBody["values"] = {};
  for (const characteristic of activeCharacteristics(characteristics)) {
    const value = draft.values[characteristic.key];
    if (isGiven(value)) {
      values[characteristic.key] = typeof value === "string" && characteristic.type === "text" ? value.trim() : (value as number | boolean | string);
    }
  }
  const description = draft.description.trim();
  return {
    regionId: draft.regionId ?? 0,
    occurredOn: draft.occurredOn,
    ...(description !== "" && { description }),
    values,
  };
}

/** A stored value as people read it: the option's label, Yes or No, or the number with its unit. */
export function displayValue(characteristic: Characteristic | undefined, value: number | boolean | string): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (characteristic?.type === "category") {
    return characteristic.options.find((option) => option.key === value)?.label ?? String(value);
  }
  if (characteristic?.type === "number" && typeof value === "number") {
    return characteristic.unit ? `${value} ${characteristic.unit}` : String(value);
  }
  return String(value);
}
