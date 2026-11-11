// Shared by the server page, which loads the first page, and the table, which loads the rest.
// It must stay a plain module: a value exported from a "use client" file reaches the server
// as a reference, not as its value.

export const accountsPageSize = 50;

export const accountsQueryKey = ["accounts", accountsPageSize] as const;
