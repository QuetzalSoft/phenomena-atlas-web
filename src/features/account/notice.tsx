import type { ReactNode } from "react";
import ui from "@/components/ui.module.css";
import styles from "./account.module.css";

/** A card that explains why the page cannot show what was asked, and what to do about it. */
export function Notice({ title, children, action, testId }: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <section className={`${ui.card} ${styles.notice}`} role="status" data-testid={testId}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.muted}>{children}</p>
      {action && <div className={styles.noticeAction}>{action}</div>}
    </section>
  );
}
