import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Notice } from "@/features/account/notice";
import { SignInLink } from "@/features/account/sign-in-link";
import { getViewer } from "@/lib/api/server";

/**
 * Renders the children only for a signed-in admin, and otherwise the notice that explains
 * why not. Anonymous visitors are sent to sign in and brought back to `path`.
 */
export async function AdminGate({ path, what, children }: { path: string; what: string; children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer.state === "anonymous") {
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent(path)}`);
  }
  if (viewer.state === "expired") {
    return (
      <Notice title="Your session has expired" action={<SignInLink label="Sign in again" />}>
        Sign in again to {what}.
      </Notice>
    );
  }
  if (viewer.state === "unknown") {
    return (
      <Notice title="The API did not answer">
        Your account could not be loaded, so this page cannot tell whether you may {what}. Reload the page to try again.
      </Notice>
    );
  }
  if (viewer.account.role !== "admin") {
    return (
      <Notice title="This page needs the admin role" testId="admin-required">
        Only admins can {what}. Ask an admin if you need a different role.
      </Notice>
    );
  }
  return children;
}
