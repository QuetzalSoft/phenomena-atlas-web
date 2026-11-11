"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useState } from "react";
import ui from "@/components/ui.module.css";
import { errorCode, type ApiClient } from "@/lib/api";
import { useSessionApi } from "@/lib/api/use-session-api";
import { accountsPageSize, accountsQueryKey as queryKey } from "./accounts-query";
import { displayName } from "./display-name";
import { roleInfo, roles, type Role } from "./role";
import { SignInLink } from "./sign-in-link";
import styles from "./account.module.css";

type Account = components["schemas"]["Account"];
type AccountPage = components["schemas"]["AccountPage"];


/** A failed call, reduced to what the copy depends on. */
class RequestFailed extends Error {
  constructor(readonly status: number | undefined, readonly code: string | undefined) {
    super(code ?? `HTTP ${status ?? "unreachable"}`);
  }
}

async function call<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result;
  try {
    result = await request();
  } catch {
    throw new RequestFailed(undefined, undefined);
  }
  if (result.data === undefined) {
    throw new RequestFailed(result.response.status, errorCode(result.error));
  }
  return result.data;
}

function listAccounts(api: ApiClient, cursor: string | undefined, signal: AbortSignal) {
  return call(() => api.GET("/accounts", { params: { query: { limit: accountsPageSize, cursor } }, signal }));
}

/** Every account with its role, oldest first. Admins change other accounts' roles here. */
export function AccountsTable({ me, firstPage }: { me: Account; firstPage: AccountPage }) {
  const api = useSessionApi();
  const accounts = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => listAccounts(api, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [firstPage], pageParams: [undefined] },
    // The server just loaded the first page. Do not load it again straight away.
    staleTime: 30_000,
  });

  const rows = accounts.data.pages.flatMap((page) => page.items);

  return (
    <section aria-labelledby="accounts-title">
      <div className={styles.sectionHeader}>
        <h2 id="accounts-title" className={styles.sectionTitle}>Accounts</h2>
        <span className={styles.muted} data-testid="accounts-count">
          {rows.length} {rows.length === 1 ? "account" : "accounts"}{accounts.hasNextPage ? " loaded" : ""}
        </span>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table} data-testid="accounts-table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Role</th>
                <th scope="col" className={styles.createdColumn}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => (
                <AccountRow key={account.id} account={account} isMe={account.id === me.id} api={api} />
              ))}
            </tbody>
          </table>
        </div>

        {(accounts.hasNextPage || accounts.isFetchNextPageError) && (
          <footer className={styles.tableFooter}>
            {accounts.isFetchNextPageError && (
              <p className={styles.errorText} role="alert">
                {failureCopy(accounts.error, "The next accounts could not be loaded.")}
              </p>
            )}
            <button
              type="button"
              className={ui.button}
              onClick={() => void accounts.fetchNextPage()}
              disabled={accounts.isFetchingNextPage}
            >
              {accounts.isFetchingNextPage ? "Loading..." : "Load more"}
            </button>
          </footer>
        )}
      </div>
    </section>
  );
}

function AccountRow({ account, isMe, api }: { account: Account; isMe: boolean; api: ApiClient }) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<RequestFailed | undefined>();
  const change = useMutation({
    mutationFn: (role: Role) =>
      call(() => api.PUT("/accounts/{accountId}/role", { params: { path: { accountId: account.id } }, body: { role } })),
    onMutate: () => setFailure(undefined),
    onSuccess: (updated) => {
      queryClient.setQueryData<InfiniteData<AccountPage, string | undefined>>(queryKey, (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === updated.id ? updated : item)),
          })),
        },
      );
    },
    onError: (error) => setFailure(error instanceof RequestFailed ? error : new RequestFailed(undefined, undefined)),
  });

  const name = displayName(account);
  const detail = [account.username, account.email].filter((value) => value && value !== name);
  const selectId = `role-${account.id}`;
  const pendingRole = change.isPending ? change.variables : undefined;

  return (
    <tr data-testid="account-row" data-account-id={account.id}>
      <td>
        <div className={styles.accountName}>
          {name ?? <span className={styles.muted}>Never signed in</span>}
          {isMe && <span className={styles.youTag}>You</span>}
        </div>
        {detail.length > 0 && <div className={styles.accountDetail}>{detail.join(" · ")}</div>}
      </td>
      <td>
        <label htmlFor={selectId} className={styles.visuallyHidden}>
          Role of {name ?? "this account"}
        </label>
        <select
          id={selectId}
          className={styles.roleSelect}
          data-role={pendingRole ?? account.role}
          value={pendingRole ?? account.role}
          disabled={isMe || change.isPending}
          aria-describedby={isMe || failure ? `${selectId}-note` : undefined}
          onChange={(event) => change.mutate(event.target.value as Role)}
        >
          {roles.map((role) => (
            <option key={role} value={role}>{roleInfo[role].label}</option>
          ))}
        </select>
        {isMe && (
          <p id={`${selectId}-note`} className={styles.rowNote}>
            Another admin has to change your role.
          </p>
        )}
        {!isMe && failure && (
          <p id={`${selectId}-note`} className={styles.errorText} role="alert">
            {failureCopy(failure, "The role could not be changed. Try again.")}
            {failure.status === 401 && <> <SignInLink label="Sign in again" /></>}
          </p>
        )}
      </td>
      <td className={styles.createdColumn}>
        <time dateTime={account.createdAt}>{formatDate(account.createdAt)}</time>
      </td>
    </tr>
  );
}

function failureCopy(error: unknown, fallback: string): string {
  if (!(error instanceof RequestFailed)) {
    return fallback;
  }
  if (error.status === undefined) {
    return "The API did not answer. Check your connection and try again.";
  }
  switch (error.code) {
    case "own_role_change_forbidden":
      return "You cannot change your own role. Another admin has to do it.";
    case "account_not_found":
      return "This account no longer exists. Reload the page.";
    case "unauthorized":
      return "Your session has expired.";
    case "forbidden":
      return "You no longer have the admin role. Reload the page.";
    default:
      return fallback;
  }
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
