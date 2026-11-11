// The account list's filters, kept in the URL so a link opens the same view and a reload
// keeps it. A plain module: the server page and the client table both read it, and a value
// exported from a "use client" file reaches the server only as a reference.
import { createLoader, createParser, createSerializer, parseAsString, parseAsStringLiteral, type inferParserType } from "nuqs/server";
import type { paths } from "@quetzalsoft/phenomena-atlas-contract";
import { roles } from "./role";

/** A calendar day, YYYY-MM-DD, as an <input type="date"> holds it. Read as a UTC day. */
const parseAsDay = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null),
  serialize: (value: string) => value,
});

export const accountFilterParsers = {
  q: parseAsString.withDefault(""),
  role: parseAsStringLiteral(roles),
  /** First day included. */
  from: parseAsDay,
  /** Last day included. */
  to: parseAsDay,
};

export type AccountFilters = inferParserType<typeof accountFilterParsers>;

export const loadAccountFilters = createLoader(accountFilterParsers);

/** A URL with these filters in its query, such as /admin/accounts?role=admin. */
export const withAccountFilters = createSerializer(accountFilterParsers);

export const noAccountFilters: AccountFilters = { q: "", role: null, from: null, to: null };

/** The contract's limit on the text filter. */
export const searchMaxLength = 100;

type ListParams = NonNullable<paths["/accounts"]["get"]["parameters"]["query"]>;

export function hasFilters(filters: AccountFilters): boolean {
  return filters.q.trim() !== "" || filters.role !== null || filters.from !== null || filters.to !== null;
}

/** The last day comes before the first. The API refuses such a range, so it is never sent. */
export function isInvertedRange({ from, to }: AccountFilters): boolean {
  return from !== null && to !== null && from > to;
}

/**
 * The filters as the API takes them. Days are whole UTC days, as the Created column shows
 * them: `to` is included, so the API's exclusive bound is the start of the day after it.
 */
export function toListParams(filters: AccountFilters): Omit<ListParams, "limit" | "cursor"> {
  const q = filters.q.trim().slice(0, searchMaxLength);
  return {
    ...(q && { q }),
    ...(filters.role && { role: filters.role }),
    ...(filters.from && { createdFrom: `${filters.from}T00:00:00.000Z` }),
    ...(filters.to && { createdBefore: dayAfter(filters.to) }),
  };
}

function dayAfter(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
