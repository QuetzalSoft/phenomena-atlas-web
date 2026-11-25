import Link from "next/link";
import { getViewer } from "@/lib/api/server";
import { displayName } from "./display-name";
import { RoleBadge } from "./role-badge";
import { SignInLink } from "./sign-in-link";
import { SignUpLink } from "./sign-up-link";
import { SignOutButton } from "./sign-out-button";
import styles from "./account.module.css";

/** The header's account area: who is signed in and with which role, or a way to sign in. */
export async function AccountMenu() {
  const viewer = await getViewer();

  if (viewer.state === "anonymous") {
    return <><SignInLink /><SignUpLink /></>;
  }
  if (viewer.state === "expired") {
    return <SignInLink label="Sign in again" />;
  }

  const name = viewer.state === "signed-in" ? displayName(viewer.account) : viewer.name;
  return (
    <>
      <span className={styles.who} data-testid="signed-in-as">
        <Link href="/account" className={styles.whoName}>{name ?? "Signed in"}</Link>
        {viewer.state === "signed-in" && <RoleBadge role={viewer.account.role} />}
      </span>
      <SignOutButton />
    </>
  );
}

