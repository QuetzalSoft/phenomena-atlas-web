import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ui from "@/components/ui.module.css";
import {
  isInvertedRange,
  loadAccountFilters,
  toListParams,
  withAccountFilters,
  type AccountFilters,
} from "@/features/account/account-filters";
import { accountsPageSize } from "@/features/account/accounts-query";
import { AccountsTable } from "@/features/account/accounts-table";
import { Notice } from "@/features/account/notice";
import { RoleDefinitions } from "@/features/account/role-definitions";
import { SignInLink } from "@/features/account/sign-in-link";
import { getViewer } from "@/lib/api/server";
import styles from "@/features/account/account.module.css";

export const metadata: Metadata = { title: "Accounts" };

// Accounts and roles change at any time, and the page depends on who is asking.
export const dynamic = "force-dynamic";

const path = "/admin/accounts";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [viewer, filters] = await Promise.all([getViewer(), loadAccountFilters(searchParams)]);
  if (viewer.state === "anonymous") {
    // Come back to the same filters after signing in.
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent(withAccountFilters(path, filters))}`);
  }

  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Administration</p>
      <h1 className={ui.title}>Accounts and roles</h1>
      <p className={ui.lead}>
        Everyone who has signed in, and what their role lets them do. A role change takes effect
        on their next request.
      </p>
      <div className={styles.sections}>{await content(viewer, filters)}</div>
    </main>
  );
}

async function content(viewer: Exclude<Awaited<ReturnType<typeof getViewer>>, { state: "anonymous" }>, filters: AccountFilters) {
  if (viewer.state === "expired") {
    return (
      <Notice title="Your session has expired" action={<SignInLink label="Sign in again" />}>
        Sign in again to manage accounts.
      </Notice>
    );
  }
  if (viewer.state === "unknown") {
    return (
      <Notice title="The API did not answer">
        Your account could not be loaded, so this page cannot tell whether you may manage accounts.
        Reload the page to try again.
      </Notice>
    );
  }
  if (viewer.account.role !== "admin") {
    return (
      <>
        <Notice title="This page needs the admin role" testId="admin-required">
          Only admins can see and change accounts. Ask an admin if you need a different role.
        </Notice>
        <RoleDefinitions current={viewer.account.role} />
      </>
    );
  }

  // An inverted range is refused by the API; the table explains it without asking.
  const firstPage = isInvertedRange(filters)
    ? undefined
    : await viewer.api
        .GET("/accounts", { params: { query: { ...toListParams(filters), limit: accountsPageSize } }, cache: "no-store" })
        .catch(() => undefined);

  return (
    <>
      {isInvertedRange(filters) || firstPage?.data ? (
        <AccountsTable me={viewer.account} initialFilters={filters} firstPage={firstPage?.data} />
      ) : (
        <Notice title="Accounts could not be loaded">
          The API did not return the list of accounts. Reload the page to try again.
        </Notice>
      )}
      <RoleDefinitions current={viewer.account.role} />
    </>
  );
}
