import { getViewer } from "@/lib/api/server";
import { displayName } from "./display-name";
import { RoleBadge } from "./role-badge";
import { SignInLink } from "./sign-in-link";
import { SignOutButton } from "./sign-out-button";
import styles from "./account.module.css";

/** The header's account area: who is signed in and with which role, or a way to sign in. */
export async function AccountMenu() {
  const viewer = await getViewer();

  if (viewer.state === "anonymous") {
    return <SignInLink />;
  }
  if (viewer.state === "expired") {
    return <SignInLink label="Sign in again" />;
  }

  const name = viewer.state === "signed-in" ? displayName(viewer.account) : viewer.name;
  return (
    <>
      <span className={styles.who} data-testid="signed-in-as">
        <span className={styles.whoName}>{name ?? "Signed in"}</span>
        {viewer.state === "signed-in" && <RoleBadge role={viewer.account.role} />}
      </span>
      <SignOutButton />
    </>
  );
}

