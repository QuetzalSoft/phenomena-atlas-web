import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ui from "@/components/ui.module.css";
import { AccountDetails } from "@/features/account/account-details";
import { Notice } from "@/features/account/notice";
import { RoleBadge } from "@/features/account/role-badge";
import { SignInLink } from "@/features/account/sign-in-link";
import { getViewer } from "@/lib/api/server";
import styles from "@/features/account/account.module.css";

export const metadata: Metadata = { title: "Your account" };

// The details change when the person edits them, and the page depends on who is asking.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await getViewer();
  if (viewer.state === "anonymous") {
    redirect("/auth/sign-in?callbackUrl=%2Faccount");
  }

  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Your account</p>
      <h1 className={ui.title}>Your details</h1>
      <div className={styles.sections}>
        {viewer.state === "signed-in" ? (
          <section className={`${ui.card} ${styles.detailsCard}`} aria-label="Your details">
            <p className={styles.muted}>
              Signed in as <strong>{viewer.account.username}</strong> <RoleBadge role={viewer.account.role} />
            </p>
            <AccountDetails account={viewer.account} />
          </section>
        ) : viewer.state === "expired" ? (
          <Notice title="Your session has expired" action={<SignInLink label="Sign in again" />}>
            Sign in again to see your details.
          </Notice>
        ) : (
          <Notice title="The API did not answer">
            Your account could not be loaded. Reload the page to try again.
          </Notice>
        )}
      </div>
    </main>
  );
}
