import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./site-header.module.css";

interface SiteHeaderProps {
  /** Links beside the product name. */
  nav: ReactNode;
  /** Who is signed in, or a way to sign in. */
  account: ReactNode;
}

export function SiteHeader({ nav, account }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>Phenomena Atlas</Link>
        <nav className={styles.nav} aria-label="Main">{nav}</nav>
        <div className={styles.account}>{account}</div>
      </div>
    </header>
  );
}
