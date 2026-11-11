// Shared by the server page, which loads the first page, and the table, which loads the rest.
// It must stay a plain module: a value exported from a "use client" file reaches the server
// as a reference, not as its value.
import type { toListParams } from "./account-filters";

export const accountsPageSize = 50;

/** One cached list per set of filters, as the API receives them. */
export function accountsQueryKey(params: ReturnType<typeof toListParams>) {
  return ["accounts", accountsPageSize, params] as const;
}
